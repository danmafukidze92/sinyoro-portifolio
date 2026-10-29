// HTML renderers shared by the 3D modal and the classic view.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const chips = (items) => `<ul class="chips">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
const list = (items) => `<ul class="c-list">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;

export function aboutHTML(d) {
  const p = d.profile;
  return `
    <p class="c-eyebrow">About me</p>
    <h2 class="c-title" id="modal-title">${esc(p.fullName)}</h2>
    <p class="c-lead">${esc(p.summary)}</p>
    <div class="stats">${d.stats.map((s) => `<div class="stat"><strong>${esc(s.value)}<small>${esc(s.unit)}</small></strong><p>${esc(s.label)}</p></div>`).join('')}</div>
    <p class="c-eyebrow">Education</p>
    <p>${esc(d.education.degree)} — ${esc(d.education.school)}, ${esc(d.education.year)}</p>
    <p class="c-eyebrow" style="margin-top:18px">Currently studying</p>
    ${chips(d.nowLearning)}
    <p class="c-eyebrow" style="margin-top:18px">Languages</p>
    <p>${p.languages.map(esc).join(' · ')} · ${esc(p.location)}</p>
    ${contactLinks(p)}`;
}

export function experienceHTML(m) {
  return `
    <p class="c-eyebrow">${esc(m.period)}${m.place ? ' · ' + esc(m.place) : ''}</p>
    <h2 class="c-title" id="modal-title">${esc(m.role)}</h2>
    <p class="c-lead">${esc(m.company)}</p>
    ${m.points?.length ? list(m.points) : ''}`;
}

export function projectHTML(p) {
  const links = (p.links || []).map((l) => `<a class="btn btn-ghost" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('');
  return `
    <p class="c-eyebrow" style="color:${esc(p.color)}">${esc(p.status)} · ${esc(p.tagline)}</p>
    <h2 class="c-title" id="modal-title">${esc(p.name)}</h2>
    <p class="c-lead">${esc(p.description)}</p>
    ${list(p.features)}
    ${chips(p.stack)}
    ${links ? `<div class="project-links">${links}</div>` : ''}`;
}

export function skillsHTML(d) {
  return `
    <p class="c-eyebrow">Toolbox</p>
    <h2 class="c-title" id="modal-title">Skills</h2>
    <div class="skill-groups">${d.skillGroups.map((g) => `<div><h3>${esc(g.group)}</h3>${chips(g.items)}</div>`).join('')}</div>`;
}

export function certsHTML(d) {
  return `
    <p class="c-eyebrow">Certified</p>
    <h2 class="c-title" id="modal-title">Certifications</h2>
    <div class="cert-grid">${d.certifications.map((c) => `<div class="cert"><small>${esc(c.issuer)}</small><p>${esc(c.name)}</p></div>`).join('')}</div>
    <p class="c-eyebrow" style="margin-top:20px">Next up</p>
    ${chips(d.nowLearning)}`;
}

function contactLinks(p) {
  return `<div class="contact-links">
    <a class="btn btn-primary" href="mailto:${esc(p.email)}">Email me</a>
    <a class="btn btn-ghost" href="${esc(p.linkedin)}" target="_blank" rel="noopener">LinkedIn ↗</a>
    <a class="btn btn-ghost" href="tel:${esc(p.phone.replace(/\s/g, ''))}">${esc(p.phone)}</a>
  </div>`;
}

export function contactHTML(d) {
  return `
    <p class="c-eyebrow">Let’s talk</p>
    <h2 class="c-title" id="modal-title">Contact</h2>
    <p class="c-lead">Open to conversations about ERP, cloud, cybersecurity, unified communications and DevOps work, in Zimbabwe and across the region.</p>
    ${contactLinks(d.profile)}
    <form class="contact-form" novalidate>
      <label>Name<input name="name" required maxlength="120" autocomplete="name" /></label>
      <label>Email<input name="email" type="email" required maxlength="200" autocomplete="email" /></label>
      <label>Message<textarea name="message" rows="5" required minlength="10" maxlength="4000"></textarea></label>
      <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
      <button class="btn btn-primary" type="submit">Send message</button>
      <p class="form-status" role="status"></p>
    </form>`;
}

/** Wire up any contact form inside `root`. */
export function bindContactForms(root) {
  root.querySelectorAll('form.contact-form').forEach((form) => {
    form.addEventListener('keydown', (e) => e.stopPropagation()); // don't drive while typing
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = form.querySelector('.form-status');
      const btn = form.querySelector('button[type=submit]');
      const body = Object.fromEntries(new FormData(form).entries());
      if (!body.name || !body.email || (body.message || '').length < 10) {
        status.className = 'form-status err';
        status.textContent = 'Please add your name, email and a message of at least 10 characters.';
        return;
      }
      btn.disabled = true; status.className = 'form-status'; status.textContent = 'Sending…';
      try {
        const res = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) throw new Error(json.error || 'Something went wrong.');
        form.reset();
        status.className = 'form-status ok';
        status.textContent = 'Thanks! Your message is on its way. I’ll get back to you soon.';
      } catch (err) {
        status.className = 'form-status err';
        status.textContent = err.message || 'Could not send. Please email me directly.';
      } finally { btn.disabled = false; }
    });
  });
}

export function classicHTML(d) {
  const p = d.profile;
  const [first, ...rest] = p.name.split(' ');
  return `
    <div class="classic-nav">
      <strong>${esc(p.name)}</strong>
      <nav>
        <a href="#c-about">About</a><a href="#c-experience">Experience</a><a href="#c-projects">Projects</a>
        <a href="#c-skills">Skills</a><a href="#c-certs">Certifications</a><a href="#c-contact">Contact</a>
        <a href="#" id="back-to-3d"><strong>▶ Drive the 3D version</strong></a>
      </nav>
    </div>
    <section class="classic-hero" id="c-about">
      <p class="c-eyebrow">${esc(p.location)}</p>
      <h1>${esc(first)} <span>${esc(rest.join(' '))}</span></h1>
      <p class="c-lead">${esc(p.title)}</p>
      <p class="c-lead">${esc(p.summary)}</p>
      <div class="stats">${d.stats.map((s) => `<div class="stat"><strong>${esc(s.value)}<small>${esc(s.unit)}</small></strong><p>${esc(s.label)}</p></div>`).join('')}</div>
    </section>
    <section class="classic-section" id="c-experience">
      <h2>Experience</h2>
      <ol class="timeline">
        ${d.experience.map((m) => `<li><h3>${esc(m.role)}</h3><p class="meta">${esc(m.company)} · ${esc(m.period)}</p>${list(m.points)}</li>`).join('')}
        <li><h3>${esc(d.education.degree)}</h3><p class="meta">${esc(d.education.school)} · ${esc(d.education.year)}</p></li>
      </ol>
    </section>
    <section class="classic-section" id="c-projects">
      <h2>Projects</h2>
      <div class="project-grid">
        ${d.projects.map((pr) => `<article class="project-card" style="--c:${esc(pr.color)}">
          <p class="c-eyebrow" style="color:${esc(pr.color)}">${esc(pr.status)}</p>
          <h3>${esc(pr.name)}</h3><p><strong>${esc(pr.tagline)}</strong></p><p>${esc(pr.description)}</p>
          ${chips(pr.stack)}
          ${(pr.links || []).length ? `<div class="project-links">${pr.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join(' · ')}</div>` : ''}
        </article>`).join('')}
      </div>
    </section>
    <section class="classic-section" id="c-skills">${skillsHTML(d).replace('id="modal-title"', '')}</section>
    <section class="classic-section" id="c-certs">${certsHTML(d).replace('id="modal-title"', '')}</section>
    <section class="classic-section" id="c-contact">${contactHTML(d).replace('id="modal-title"', '')}</section>
    <footer class="classic-footer">© ${new Date().getFullYear()} ${esc(p.fullName)} · Built with Spring Boot, Three.js &amp; cannon-es · nexigent-labs.co.zw</footer>`;
}
