# sinyoro — Daniel Mafukidze interactive portfolio

A drivable 3D portfolio inspired by bruno-simon.com. Visitors drive a tuned V8 performance saloon across a
savanna world: a career road with one gate per job, a project plaza, skill crates to smash, certification
plaques and a contact mailbox. There is also a classic (non-3D) view for recruiters and older devices.

**Live:** https://www.nexigent-labs.co.zw

## Stack

| Layer | Tech |
|---|---|
| Backend | Java 25, Spring Boot 4.1.1, Maven: serves the site, `GET /api/portfolio`, `POST /api/contact`, `/actuator/health` |
| 3D | Three.js 0.170 (rendering), cannon-es 0.20 (physics, raycast vehicle) |
| Sound | Web Audio API: procedural twin-turbo V8 (no audio files) |
| Front-end build | Vite 5, run by Maven through `frontend-maven-plugin` |
| Deploy | Git → Jenkins → Docker image → container on the Contabo VPS → Nginx Proxy Manager (HTTPS) |

## Editing content

All text comes from **`src/main/resources/portfolio.json`**: profile, stats, experience, projects, skills,
crate labels and certifications. Edit it, commit and push; the billboards, gates, crates and classic view
regenerate from it. To add live demo links to a project, fill in its `links` array:

```json
"links": [{ "label": "Live demo", "url": "https://ppe.nexigent-labs.co.zw" }]
```

## Run locally (IntelliJ / terminal)

```bash
mvn clean package            # builds the front end + jar (first run downloads Node into target/node)
java -jar target/sinyoro-portfolio.jar
# → http://localhost:8690 (locally it still uses 8690; the container uses 80)
```

Front-end hot reload while you work on the 3D world:

```bash
cd frontend
npm install
npm run dev                  # → http://localhost:5173 (portfolio.json served directly; contact form proxies to :8690)
```

Build only the Java side (skips Node): `mvn package -Dskip.frontend=true`

## Controls

| Key | Action |
|---|---|
| W A S D / arrows | Drive |
| Shift | Boost (more turbo) |
| Space | Handbrake / drift |
| E or Enter | Open the zone you are parked on |
| R | Reset car |
| C | Change paint |
| V | Cockpit (driver's seat) / chase view |
| M | Sound on/off |
| G | Go to (teleport menu) |
| H | Classic view |

On phones, on-screen buttons appear automatically.

## Deploy to https://www.nexigent-labs.co.zw

The container is called **`www`** and listens on **port 80 inside the container**. Its files (the compose file and
contact messages) live in **`~/www`** (`/home/sinyoro92/www`) on the VPS. Nginx Proxy Manager already owns host
ports 80 and 443, so it forwards the domain to the container over the shared Docker network.

1. Push to GitHub (e.g. `danmafukidze92/sinyoro`):
   ```bash
   git init -b main && git add . && git commit -m "Interactive 3D portfolio"
   git remote add origin https://github.com/danmafukidze92/sinyoro.git
   git push -u origin main
   ```
2. In Jenkins (port 8800), create a **Pipeline** job `www` → *Pipeline script from SCM* → the repo → branch `main`
   → `Jenkinsfile`. When you run it, Jenkins:
   - builds the image (Java 25 + front end, all inside Docker)
   - creates `~/www` and `~/www/data` and copies `docker-compose.yml` there
   - replaces the `www` container (port 80) and joins it to Nginx Proxy Manager's network (auto-detected)
   - waits for the health check
3. **DNS:** A records for `www` and `@` → `167.86.87.208`.
4. **Nginx Proxy Manager → Proxy Hosts → Add:**
   - Domain names: `www.nexigent-labs.co.zw` (and `nexigent-labs.co.zw` if you want the bare domain too)
   - Scheme `http`, Forward hostname **`www`**, port **`80`**
   - SSL tab: request a Let's Encrypt certificate and turn on **Force SSL** and **HTTP/2**
   - Optional: add a redirection host `nexigent-labs.co.zw` → `https://www.nexigent-labs.co.zw`

If the auto-detection picks the wrong network, set `PROXY_NET` in the Jenkinsfile to NPM's network (find it with
`docker inspect <npm-container> -f '{{json .NetworkSettings.Networks}}'`). If you ever run without NPM and host
port 80 is free, set `HOST_PORT = '80'` to publish it directly.

Manual control on the VPS: `cd ~/www && docker compose up -d` (start or update), `docker logs -f www` (logs).

### Optional: email contact-form messages

Messages are always appended to `/app/data/messages.log` (`~/www/data` on the VPS). To also email
them (e.g. through your mailcow server), add these to the `docker run` in the Jenkinsfile, ideally from Jenkins
credentials:

```
-e SPRING_MAIL_HOST=mail.nexigent-labs.co.zw -e SPRING_MAIL_PORT=587 \
-e SPRING_MAIL_USERNAME=portfolio@nexigent-labs.co.zw -e SPRING_MAIL_PASSWORD=*** \
-e CONTACT_FROM=portfolio@nexigent-labs.co.zw -e CONTACT_TO=danmafukidze92@gmail.com
```

Read messages on the VPS: `cat ~/www/data/messages.log`

## Project layout

```
pom.xml                         Spring Boot 4.1.1 + frontend-maven-plugin
Dockerfile, Jenkinsfile         build + deploy
src/main/java/.../portfolio     PortfolioApplication, PortfolioController, ContactController, WebConfig
src/main/resources              application.yml, portfolio.json (all content)
frontend/
  index.html                    loader, HUD, modal, touch controls
  src/main.js                   boot, input, UI wiring, classic view
  src/world/Experience.js       renderer, physics loop, chase camera, minimap
  src/world/Car.js              the saloon: model, raycast-vehicle physics, paints, exhaust flames
  src/world/Zones.js            name letters, career gates, project billboards, crates, certs, contact, bowling
  src/world/Environment.js      sky, lights, ground, roads, baobabs, acacias, balancing rocks
  src/audio/V8Engine.js         procedural twin-turbo V8 exhaust sound
  src/ui/content.js             HTML for panels and the classic view
```

The car is an original low-poly model in the style of a tuned E63 S, with no manufacturer badges. The engine
sound is synthesised (cross-plane V8 burble, turbo spool, blow-off, over-run pops), so there are no audio files to
license.
