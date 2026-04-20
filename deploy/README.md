# Docker VM Manual Deploy

这套方案默认：

- 代码目录：`/srv/jeeves`
- 宿主机只对外暴露 `3000` 端口
- Docker 里运行 3 个服务：`backend`、`frontend`、`gateway`
- `gateway` 容器监听 `3000`，把 `/api` 转发给后端，把 `/` 转发给前端
- GitHub Actions 通过 SSH 登录 VM，然后执行 `deploy/deploy.sh`
- SQLite 放在 Docker named volume 里，后端容器里路径是 `/data/jeeves.db`

## 1. 先准备服务器

因为你只能用 Termius 连接，所以这部分你在 Termius 里执行就行。
我这边不能直接使用 Termius，也不能直接连你的服务器。

推荐在 Ubuntu 上安装 Docker 和 Compose：

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
newgrp docker
docker compose version || docker-compose version
```

如果这里提示没有 compose，再补装一个：

```bash
sudo apt-get update
sudo apt-get install -y docker-compose-plugin || sudo apt-get install -y docker-compose
docker compose version || docker-compose version
```

然后准备目录并拉代码：

```bash
sudo mkdir -p /srv/jeeves
sudo chown -R "$USER:$USER" /srv/jeeves
git clone https://github.com/cliuxinxin/jeeves.git /srv/jeeves
```

如果已经 clone 过，就跳过 `git clone`。

## 2. 配后端环境变量

创建 `/srv/jeeves/backend/.env`：

```env
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=
OPENAI_TEMPERATURE=0.2
OPENAI_MAX_RETRIES=2
CORS_ORIGINS=http://your-server-ip:3000
DATABASE_PATH=/data/jeeves.db

AUTH_USERNAME=admin
AUTH_PASSWORD=replace-with-a-strong-password
AUTH_SESSION_SECRET=replace-with-a-long-random-secret
AUTH_COOKIE_SECURE=false
AUTH_COOKIE_SAMESITE=lax
```

说明：

- 如果你后面上 HTTPS，把 `AUTH_COOKIE_SECURE` 改成 `true`。
- `DATABASE_PATH=/data/jeeves.db` 对应的是 Docker volume，不是宿主机目录。
- `AUTH_PASSWORD` 和 `AUTH_SESSION_SECRET` 不要继续用默认值。
- `CORS_ORIGINS` 可以先填 `http://你的服务器IP:3000`。

## 3. 配 Compose 环境变量

先复制一份模板：

```bash
cd /srv/jeeves
cp deploy/.env.compose.example deploy/.env.compose
```

默认内容是：

```env
COMPOSE_PROJECT_NAME=jeeves
HOST_PORT=3000
NEXT_PUBLIC_API_URL=same-origin
```

这三个值通常都不用改。

这里的 `same-origin` 是这次新加的特殊值，意思是前端直接请求当前站点自己的 `/api`，所以不用在构建时写死你的 IP 或域名。

## 4. 先在服务器手动启动一次

第一次建议先手动跑，确认 Docker、环境变量和镜像构建都没问题：

```bash
cd /srv/jeeves
bash deploy/deploy.sh
```

看运行状态：

```bash
docker compose --env-file deploy/.env.compose -f deploy/docker-compose.yml ps || docker-compose --env-file deploy/.env.compose -f deploy/docker-compose.yml ps
```

看日志：

```bash
docker compose --env-file deploy/.env.compose -f deploy/docker-compose.yml logs -f || docker-compose --env-file deploy/.env.compose -f deploy/docker-compose.yml logs -f
```

如果一切正常，你就可以通过：

```text
http://你的服务器IP:3000
```

直接访问。

## 5. 给 GitHub Actions 配 SSH

在服务器上生成一把专门给 GitHub Actions 的部署密钥：

```bash
ssh-keygen -t ed25519 -C "jeeves-deploy" -f ~/.ssh/jeeves_deploy
cat ~/.ssh/jeeves_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

然后把私钥内容复制出来：

```bash
cat ~/.ssh/jeeves_deploy
```

## 6. 在 GitHub 仓库里配置 Secrets 和 Variables

你的仓库是：

- `https://github.com/cliuxinxin/jeeves`

进入：

- `Settings -> Secrets and variables -> Actions`

创建这些 **Secrets**：

- `SSH_HOST`: 你的 VM 公网 IP 或域名
- `SSH_USER`: 你的服务器登录用户
- `SSH_KEY`: 上一步生成的私钥全文
- `SSH_PORT`: 一般填 `22`

可选创建这些 **Variables**：

- `APP_DIR`: 默认 `/srv/jeeves`
- `DEPLOY_BRANCH`: 默认 `main`

## 7. GitHub Actions 怎么工作

仓库里已经准备好了：

- `.github/workflows/deploy.yml`

它会在两种情况下直接部署，不再等待 `CI` workflow：

- 你往 `main` 推代码
- 你在 GitHub 的 `Actions` 页面手动触发 `Deploy`

部署时会做这些事：

1. SSH 登录服务器
2. `git pull`
3. `docker compose build --pull`
4. `docker compose up -d --remove-orphans`

## 8. 这套 Docker 部署里“虚拟环境”怎么理解

这次不再用宿主机上的 Python 虚拟环境了，因为 Docker 本身就是隔离环境。

不过后端镜像内部仍然是用 `uv sync --frozen --no-dev` 建出来的 `.venv`，所以依赖隔离依然在，只是隔离发生在容器镜像里，而不是发生在服务器宿主机上。

## 9. 常用维护命令

重新部署：

```bash
cd /srv/jeeves
bash deploy/deploy.sh
```

看容器状态：

```bash
docker compose --env-file deploy/.env.compose -f deploy/docker-compose.yml ps || docker-compose --env-file deploy/.env.compose -f deploy/docker-compose.yml ps
```

看日志：

```bash
docker compose --env-file deploy/.env.compose -f deploy/docker-compose.yml logs -f backend || docker-compose --env-file deploy/.env.compose -f deploy/docker-compose.yml logs -f backend
docker compose --env-file deploy/.env.compose -f deploy/docker-compose.yml logs -f frontend || docker-compose --env-file deploy/.env.compose -f deploy/docker-compose.yml logs -f frontend
docker compose --env-file deploy/.env.compose -f deploy/docker-compose.yml logs -f gateway || docker-compose --env-file deploy/.env.compose -f deploy/docker-compose.yml logs -f gateway
```

停止服务：

```bash
docker compose --env-file deploy/.env.compose -f deploy/docker-compose.yml down || docker-compose --env-file deploy/.env.compose -f deploy/docker-compose.yml down
```
