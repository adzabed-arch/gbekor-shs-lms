/* Gbekor SHS LMS – GitHub Pages client. All permission decisions are enforced by Supabase RLS. */
const cfg = window.LMS_CONFIG || {};
const configured = cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes('YOUR-');
const client = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
const state = { user: null, profile: null, page: 'Dashboard', courses: [], assignments: [] };
const el = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = value => value ? new Intl.DateTimeFormat('en-GB',{dateStyle:'medium'}).format(new Date(value)) : 'No due date';
const notice = (message, bad = false) => { const box = el('notice'); box.textContent = message; box.className = `notice ${bad ? 'error' : ''}`; box.classList.remove('hidden'); };
const clearNotice = () => el('notice').classList.add('hidden');

const menus = { student: ['Dashboard','My Courses','Assignments','Grades','Profile'], teacher: ['Dashboard','My Courses','Assignments','Students','Profile'], admin: ['Dashboard','Courses','Users','Profile'] };
const subtitles = { Dashboard:'Your overview and recent activity', 'My Courses':'Courses you are enrolled in or teach', Assignments:'Assignments, submissions and feedback', Grades:'Your marked work and assessment results', Students:'Student progress in your courses', Courses:'Create and manage school courses', Users:'School user directory', Profile:'Your account details' };

async function boot() {
  if (!configured) { showAuth(); setAuthMessage('Setup needed: add your Supabase URL and publishable key to config.js.', true); return; }
  const { data: { session } } = await client.auth.getSession();
  if (session && (location.hash.includes('type=recovery') || location.hash.includes('type=invite'))) showPasswordSetup();
  else if (session) await enter(session.user);
  else showAuth();
  client.auth.onAuthStateChange(async (event, session) => { if ((event === 'PASSWORD_RECOVERY' || location.hash.includes('type=invite')) && session?.user) showPasswordSetup(); else if (session?.user) await enter(session.user); else showAuth(); });
}
function showAuth() { state.user = null; state.profile = null; el('app').classList.add('hidden'); el('auth-screen').classList.remove('hidden'); el('sign-in-form').classList.remove('hidden'); el('set-password-form').classList.add('hidden'); }
function showPasswordSetup() { el('app').classList.add('hidden'); el('auth-screen').classList.remove('hidden'); el('sign-in-form').classList.add('hidden'); el('set-password-form').classList.remove('hidden'); setAuthMessage('Set a password to finish activating your account.'); }
function setAuthMessage(message, bad = false) { const messageEl = el('auth-message'); messageEl.textContent = message; messageEl.className = `message ${bad ? 'error' : 'ok'}`; }
async function enter(user) {
  state.user = user;
  const { data: profile, error } = await client.from('profiles').select('*').eq('id', user.id).single();
  if (error) { showAuth(); setAuthMessage('Your account has no school profile yet. Please contact the administrator.', true); return; }
  state.profile = profile;
  el('auth-screen').classList.add('hidden'); el('app').classList.remove('hidden');
  el('account-name').textContent = profile.full_name;
  el('role-label').textContent = `${profile.role.toUpperCase()} PORTAL`;
  renderNav(); await loadData(); await render();
}
function renderNav() {
  const items = menus[state.profile.role] || menus.student;
  if (!items.includes(state.page)) state.page = 'Dashboard';
  el('navigation').innerHTML = items.map(item => `<button class="nav ${state.page === item ? 'active' : ''}" data-page="${item}">${item}</button>`).join('');
  el('navigation').querySelectorAll('button').forEach(button => button.onclick = async () => { state.page = button.dataset.page; renderNav(); await render(); });
}
async function loadData() {
  const role = state.profile.role;
  let courseQuery = client.from('courses').select('id,title,description,teacher_id,profiles!courses_teacher_id_fkey(full_name),enrollments!inner(student_id)').eq('is_published', true).order('title');
  if (role === 'student') courseQuery = courseQuery.eq('enrollments.student_id', state.user.id);
  else if (role === 'teacher') courseQuery = client.from('courses').select('id,title,description,teacher_id,profiles!courses_teacher_id_fkey(full_name)').eq('teacher_id', state.user.id).order('title');
  else courseQuery = client.from('courses').select('id,title,description,teacher_id,profiles!courses_teacher_id_fkey(full_name)').order('title');
  const { data: courses, error: courseError } = await courseQuery;
  if (courseError) throwError(courseError); else state.courses = courses || [];
  const ids = state.courses.map(c => c.id);
  if (!ids.length) { state.assignments = []; return; }
  const { data: assignments, error } = await client.from('assignments').select('id,title,instructions,due_at,course_id,courses(title),submissions(id,student_id,status,score,feedback,file_path,submitted_at,profiles!submissions_student_id_fkey(full_name))').in('course_id', ids).order('due_at',{ascending:true});
  if (error) throwError(error); else state.assignments = assignments || [];
}
function throwError(error) { console.error(error); notice(error.message || 'Could not load school data.', true); }
async function render() {
  clearNotice(); el('title').textContent = state.page; el('subtitle').textContent = subtitles[state.page] || '';
  const view = el('view'); view.innerHTML = el('loading').innerHTML;
  try {
    const output = { Dashboard: dashboard, 'My Courses': coursesView, Assignments: assignmentsView, Grades: gradesView, Students: studentsView, Courses: manageCourses, Users: usersView, Profile: profileView }[state.page];
    view.innerHTML = output ? await output() : empty('This section is not available to your account.');
    bindPageActions();
  } catch (error) { console.error(error); view.innerHTML = empty('We could not load this page. Please refresh and try again.'); notice(error.message || 'A data error occurred.', true); }
}
const empty = text => `<div class="card empty"><h2>Nothing here yet</h2><p>${esc(text)}</p></div>`;
const stat = (label, value, foot) => `<div class="card stat"><small class="muted">${label}</small><strong>${value}</strong><span class="muted">${foot}</span></div>`;
const courseCard = course => `<article class="card"><div class="course"><div class="course-mark">📘</div><div><h3>${esc(course.title)}</h3><p>${esc(course.profiles?.full_name || 'Teacher not assigned')}</p></div></div><p class="muted">${esc(course.description || 'No course description yet.')}</p></article>`;
async function dashboard() {
  const upcoming = state.assignments.filter(a => !a.due_at || new Date(a.due_at) >= new Date()).slice(0,4);
  const submitted = state.assignments.filter(a => a.submissions.some(s => s.student_id === state.user.id));
  const role = state.profile.role;
  const header = role === 'student' ? `Welcome back, ${esc(state.profile.full_name)}` : role === 'teacher' ? `Teaching dashboard` : `Administration dashboard`;
  const action = role === 'student' ? 'My Courses' : role === 'teacher' ? 'Assignments' : 'Courses';
  return `<section class="hero"><h2>${header}</h2><p>${role === 'student' ? 'Keep up with your learning and upcoming work.' : 'Manage the school learning space from one secure account.'}</p><button class="button gold" data-go="${action}">Open ${action}</button></section><section class="grid stats">${stat(role === 'student' ? 'My courses' : 'Courses', state.courses.length, 'Available now')}${stat('Assignments', state.assignments.length, 'In your courses')}${stat(role === 'student' ? 'Submitted' : 'Due soon', role === 'student' ? submitted.length : upcoming.length, 'Current work')}${stat('Account', 'Active', state.profile.role)}</section><section class="grid two"><div><h2>My courses</h2><div class="grid">${state.courses.slice(0,3).map(courseCard).join('') || empty('You have not been enrolled in a course yet.')}</div></div><div class="card"><h2>Upcoming work</h2><ul class="list">${upcoming.map(a => `<li><span><b>${esc(a.title)}</b><br><small class="muted">${esc(a.courses?.title || '')}</small></span><span class="badge amber">${date(a.due_at)}</span></li>`).join('') || '<li class="muted">No upcoming assignments.</li>'}</ul></div></section>`;
}
async function coursesView() { return `<div class="grid">${state.courses.map(courseCard).join('') || empty('Ask the administrator to enrol you in a course.')}</div>`; }
function ownSubmission(a) { return a.submissions.find(s => s.student_id === state.user.id); }
async function assignmentsView() {
  const role = state.profile.role;
  const create = role === 'teacher' || role === 'admin' ? `<div class="toolbar"><button class="button gold" data-create-assignment>Create assignment</button></div>` : '';
  const rows = state.assignments.map(a => {
    const mine = ownSubmission(a); const status = mine ? (mine.status === 'graded' ? `Marked: ${mine.score ?? '–'}` : 'Submitted') : 'Not submitted';
    const action = role === 'student' ? `<button class="button ${mine ? 'light' : ''}" data-submit="${a.id}">${mine ? 'Replace submission' : 'Submit work'}</button>` : `<button class="button light" data-submissions="${a.id}">View submissions</button>`;
    return `<tr><td><b>${esc(a.title)}</b><br><small class="muted">${esc(a.courses?.title || '')}</small></td><td>${date(a.due_at)}</td><td><span class="badge ${mine ? 'green' : 'amber'}">${status}</span></td><td>${action}</td></tr>`;
  }).join('');
  return `${create}<div class="card"><table><thead><tr><th>Assignment</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted">No assignments have been published.</td></tr>'}</tbody></table></div>`;
}
async function gradesView() {
  const rows = state.assignments.map(a => { const s = ownSubmission(a); return s && s.status === 'graded' ? `<tr><td>${esc(a.courses?.title || '')}</td><td>${esc(a.title)}</td><td>${s.score ?? '–'}</td><td>${esc(s.feedback || '—')}</td></tr>` : ''; }).join('');
  return `<div class="card"><table><thead><tr><th>Course</th><th>Assessment</th><th>Score</th><th>Feedback</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted">No marked work yet.</td></tr>'}</tbody></table></div>`;
}
async function studentsView() {
  const { data, error } = await client.from('enrollments').select('student_id,profiles!enrollments_student_id_fkey(full_name,email),courses!inner(title)').in('course_id',state.courses.map(c=>c.id)).order('enrolled_at',{ascending:false}); if(error) throw error;
  return `<div class="card"><table><thead><tr><th>Student</th><th>Email</th><th>Course</th></tr></thead><tbody>${(data||[]).map(x=>`<tr><td>${esc(x.profiles.full_name)}</td><td>${esc(x.profiles.email || '')}</td><td>${esc(x.courses.title)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No enrolled students.</td></tr>'}</tbody></table></div>`;
}
async function manageCourses() { return `<div class="toolbar"><button class="button gold" data-create-course>Create course</button></div><div class="grid">${state.courses.map(courseCard).join('') || empty('Create your first course.')}</div>`; }
async function usersView() { const {data,error}=await client.from('profiles').select('full_name,email,role,is_active').order('full_name'); if(error)throw error; return `<div class="card"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>${data.map(p=>`<tr><td>${esc(p.full_name)}</td><td>${esc(p.email||'')}</td><td>${esc(p.role)}</td><td><span class="badge ${p.is_active?'green':'red'}">${p.is_active?'Active':'Inactive'}</span></td></tr>`).join('')}</tbody></table></div>`; }
async function profileView() { const p=state.profile; return `<div class="card"><h2>My profile</h2><p><b>Name:</b> ${esc(p.full_name)}</p><p><b>Email:</b> ${esc(p.email || state.user.email)}</p><p><b>Role:</b> ${esc(p.role)}</p><p class="muted">Your school administrator manages roles and enrolments.</p></div>`; }

function bindPageActions() {
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = async()=>{state.page=b.dataset.go;renderNav();await render();});
  document.querySelector('[data-create-course]')?.addEventListener('click', createCourse);
  document.querySelector('[data-create-assignment]')?.addEventListener('click', createAssignment);
  document.querySelectorAll('[data-submit]').forEach(b=>b.onclick=()=>submitWork(b.dataset.submit));
  document.querySelectorAll('[data-submissions]').forEach(b=>b.onclick=()=>viewSubmissions(b.dataset.submissions));
  document.querySelectorAll('[data-grade-form]').forEach(form=>form.onsubmit=gradeSubmission);
  document.querySelectorAll('[data-open-file]').forEach(button=>button.onclick=()=>openSubmissionFile(button.dataset.openFile));
}
function formCard(title, body) { el('view').innerHTML=`<div class="card"><h2>${title}</h2>${body}</div>`; }
function createCourse() { formCard('Create course', `<form id="course-form"><label>Course title</label><input name="title" required><label>Description</label><textarea name="description" rows="5"></textarea><button class="button gold" type="submit">Publish course</button></form>`); el('course-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const {error}=await client.from('courses').insert({title:f.get('title'),description:f.get('description'),teacher_id:state.profile.role==='teacher'?state.user.id:null,is_published:true});if(error)return notice(error.message,true);notice('Course created.');await loadData();await render();}; }
function createAssignment() { const options=state.courses.map(c=>`<option value="${c.id}">${esc(c.title)}</option>`).join(''); formCard('Create assignment', `<form id="assignment-form"><label>Course</label><select name="course_id" required>${options}</select><label>Title</label><input name="title" required><label>Instructions</label><textarea name="instructions" rows="5"></textarea><label>Due date and time</label><input name="due_at" type="datetime-local"><button class="button gold" type="submit">Publish assignment</button></form>`); el('assignment-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const {error}=await client.from('assignments').insert({course_id:f.get('course_id'),title:f.get('title'),instructions:f.get('instructions'),due_at:f.get('due_at')||null,created_by:state.user.id});if(error)return notice(error.message,true);notice('Assignment published.');await loadData();state.page='Assignments';renderNav();await render();}; }
function submitWork(id) { const a=state.assignments.find(x=>x.id===id); formCard(`Submit: ${esc(a.title)}`, `<p class="muted">${esc(a.instructions||'Upload your completed work.')}</p><form id="submission-form"><label>File</label><input name="file" type="file" required><label>Private note to your teacher (optional)</label><textarea name="note" rows="4"></textarea><button class="button gold" type="submit">Upload and submit</button></form>`); el('submission-form').onsubmit=async e=>{e.preventDefault(); const f=new FormData(e.target), file=f.get('file'); const path=`${state.user.id}/${id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`; notice('Uploading your work…'); const {error:uploadError}=await client.storage.from('assignment-submissions').upload(path,file,{upsert:false});if(uploadError)return notice(uploadError.message,true); const payload={assignment_id:id,student_id:state.user.id,file_path:path,note:f.get('note'),status:'submitted',submitted_at:new Date().toISOString()};const {error}=await client.from('submissions').upsert(payload,{onConflict:'assignment_id,student_id'});if(error)return notice(error.message,true);notice('Work submitted successfully.');await loadData();state.page='Assignments';renderNav();await render();}; }
async function viewSubmissions(id) { const a=state.assignments.find(x=>x.id===id); const rows=a.submissions.map(s=>`<tr><td><b>${esc(s.profiles?.full_name || s.student_id)}</b></td><td>${date(s.submitted_at)}</td><td><button class="button light" data-open-file="${esc(s.file_path)}">Open work</button></td><td><form data-grade-form data-submission-id="${s.id}" class="row-actions"><input name="score" type="number" min="0" max="100" step="0.01" value="${s.score ?? ''}" placeholder="Score" required><input name="feedback" value="${esc(s.feedback || '')}" placeholder="Feedback"><button class="button" type="submit">Save mark</button></form></td></tr>`).join(''); formCard(`Submissions: ${esc(a.title)}`, `<table><thead><tr><th>Student</th><th>Submitted</th><th>File</th><th>Mark and feedback</th></tr></thead><tbody>${rows||'<tr><td colspan="4" class="muted">No submissions yet.</td></tr>'}</tbody></table>`); bindPageActions(); }
async function gradeSubmission(event) { event.preventDefault(); const form=event.currentTarget, values=new FormData(form); const {error}=await client.from('submissions').update({score:Number(values.get('score')),feedback:values.get('feedback'),status:'graded',graded_at:new Date().toISOString()}).eq('id',form.dataset.submissionId); if(error)return notice(error.message,true); notice('Mark saved.'); await loadData(); await viewSubmissions(state.assignments.find(a=>a.submissions.some(s=>s.id===form.dataset.submissionId)).id); }
async function openSubmissionFile(path) { const {data,error}=await client.storage.from('assignment-submissions').createSignedUrl(path,60); if(error)return notice(error.message,true); window.open(data.signedUrl,'_blank','noopener'); }

el('sign-in-form').onsubmit = async event => { event.preventDefault(); setAuthMessage('Signing in…'); const {error}=await client.auth.signInWithPassword({email:el('email').value.trim(),password:el('password').value}); if(error)setAuthMessage(error.message,true); };
el('set-password-form').onsubmit = async event => { event.preventDefault(); if(el('new-password').value !== el('confirm-password').value) return setAuthMessage('The passwords do not match.',true); const {error}=await client.auth.updateUser({password:el('new-password').value}); if(error) return setAuthMessage(error.message,true); history.replaceState(null,'',location.pathname); setAuthMessage('Password saved. Signing you in…'); const {data:{user}}=await client.auth.getUser(); if(user) await enter(user); };
el('forgot-password').onclick = async () => { const email=el('email').value.trim(); if(!email)return setAuthMessage('Enter your email address first.',true); const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.href}); setAuthMessage(error?'Could not send reset email: '+error.message:'Password reset email sent.'); };
el('sign-out').onclick = ()=>client?.auth.signOut(); el('refresh').onclick=async()=>{await loadData();await render();}; boot();
