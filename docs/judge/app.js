const apiOrigin = 'https://cecom-arduino-contest-26-judge.calmhinny34.chatgpt.site/';
const judging = document.body.dataset.role === 'judge';
const gate = document.querySelector('#gate');
const entry = document.querySelector('#entry');
const content = document.querySelector('#content');
const notice = document.querySelector('#notice');
const date = value => value.replace('T', ' ');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const entryError = document.querySelector('#entry-error');
const entryHelp = document.querySelector('#entry-help');
const retry = document.querySelector('#entry-reload');
let judgeName;
let view;
let busy = false;
let toastTimer;

const sessionKey = 'cecom-contest-judge-session';
const sessionPrefix = '#cecom-session=';
const sessionPattern = /^[0-9a-f-]{36}\.[0-9]{13}\.[0-9a-f]{64}$/;
const sessionUrl = new URL('./api/pages-session', apiOrigin);
let browserSession;

function startJudgeSession() {
  try {
    if (location.hash.startsWith(sessionPrefix)) {
      const granted = location.hash.slice(sessionPrefix.length);
      history.replaceState(null, '', location.pathname + location.search);
      if (sessionPattern.test(granted)) sessionStorage.setItem(sessionKey, granted);
    }
    browserSession = sessionStorage.getItem(sessionKey);
  } catch {
    entryHelp.textContent = '채점 화면을 열 수 없습니다.';
    entryError.textContent = '브라우저에서 사이트 데이터 저장을 허용한 뒤 새로고침해 주세요.';
    return false;
  }
  if (!browserSession) {
    location.replace(sessionUrl);
    return false;
  }
  return true;
}

async function api(action, extra = {}) {
  const res = await fetch(new URL('./api/pages-entry', apiOrigin), {
    method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, judgeName, browserSession, ...extra }),
  });
  if (res.status === 401) {
    sessionStorage.removeItem(sessionKey);
    retry.hidden = false;
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

function links(team) {
  return `<div class="actions"><a class="link" href="${esc(team.doc)}" target="_blank" rel="noopener noreferrer">작품 설명서 ↗</a><a class="link" href="${esc(team.video)}" target="_blank" rel="noopener noreferrer">시연 영상 ↗</a></div>`;
}
const work = team => `<h3>${esc(team.work || team.name)}</h3>${team.work ? `<p class="work muted">${esc(team.name)}</p>` : ''}${links(team)}`;

function judgeForm(team) {
  const fields = view.rubric.map((item, i) => `<label>${esc(item.name)} (${item.max}점)<input name="score${i}" type="number" min="0" max="${item.max}" step="1" value="${team.scores?.[i] ?? ''}" required></label>`).join('');
  return `<article class="panel"><div class="line"><p class="eyebrow">출품작</p><span class="state ${team.scores ? '' : 'warn'}">${team.scores ? '채점 완료' : '미채점'}</span></div>${work(team)}
    ${view.status === 'open' ? `<form data-judge="${esc(team.id)}"><div class="scores">${fields}</div><button>${team.scores ? '점수 수정' : '점수 저장'}</button><p class="error" role="alert"></p></form>` : team.scores ? `<p class="muted">저장된 점수 ${team.scores.reduce((a,b)=>a+b,0)}점</p>` : ''}</article>`;
}
function voteCards() {
  const canVote = view.status === 'open' && view.selected === null;
  const cards = view.teams.map(team => `<article class="panel">${work(team)}${canVote
    ? `<label class="pick"><input type="checkbox" name="team" value="${esc(team.id)}">이 작품에 투표</label>`
    : view.selected?.includes(team.id) ? '<p class="pick"><span class="state">내가 투표한 작품</span></p>' : ''}</article>`).join('');
  return `<form id="ballot"><div class="grid">${cards}</div>${canVote ? '<div class="vote-action"><button>선택한 작품에 투표하기</button><p class="muted">여러 작품을 선택할 수 있습니다. 브라우저당 한 번 제출할 수 있으며 제출한 표는 변경할 수 없습니다.</p><p class="error" role="alert"></p></div>' : ''}</form>`;
}

function render() {
  const status = view.status === 'waiting' ? '심사 시작 전' : view.status === 'closed' ? '마감' : '참여 가능';
  const used = !judging && view.selected !== null;
  const detail = judging ? `채점 완료 ${view.teams.filter(team => team.scores).length}/${view.teams.length}팀`
    : used ? '투표를 제출했습니다.' : '작품 설명서와 시연 영상을 확인한 뒤 투표할 작품을 선택해 주세요.';
  content.innerHTML = `<section class="summary"><div class="line"><strong>${judging ? esc(view.name) + ' 심사위원' : 'CECOM 부원 투표'}</strong><span class="state ${view.status === 'open' ? '' : 'warn'}">${status}</span></div>
    <p class="muted">${judging ? '심사 기간 · ' + date(view.start) + ' ~ ' : '투표 마감 · '}${date(view.end)} (KST)</p><p>${detail}</p></section>
    ${view.teams.length ? judging ? `<div class="grid">${view.teams.map(judgeForm).join('')}</div>` : voteCards()
      : '<section class="panel"><h2>공개된 작품이 없습니다</h2><p class="muted">운영진이 제출물을 등록하면 이곳에 표시됩니다.</p></section>'}
    <div class="vote-action"><button type="button" id="reload" class="secondary">작품·상태 새로고침</button>${judging ? ' <button type="button" id="change-judge" class="secondary">이름 다시 선택</button>' : ''}</div>`;
  entry.hidden = true;
  content.hidden = false;
}

function notify(message) {
  clearTimeout(toastTimer);
  notice.textContent = message;
  toastTimer = setTimeout(() => { notice.textContent = ''; }, 4200);
}

async function initialize() {
  if (busy) return;
  busy = true;
  entry.hidden = false;
  content.hidden = true;
  gate.hidden = true;
  retry.hidden = true;
  entryError.textContent = '';
  entryHelp.textContent = '참여 화면을 불러오는 중입니다.';
  try {
    if (judging) {
      const { judges } = await api('list');
      gate.elements.judgeName.innerHTML = '<option value="">이름을 선택해 주세요</option>'
        + judges.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
      gate.hidden = !judges.length;
      retry.hidden = Boolean(judges.length);
      entryHelp.textContent = judges.length ? '운영진이 등록한 이름 중 본인의 이름을 선택해 주세요.'
        : '등록된 심사위원이 없습니다. 운영진이 이름을 등록하면 다시 불러와 주세요.';
    } else {
      view = await api('open');
      render();
    }
  } catch (problem) {
    entryHelp.textContent = '참여 화면을 불러오지 못했습니다.';
    entryError.textContent = problem.message;
    retry.hidden = false;
  } finally {
    busy = false;
  }
}

retry.addEventListener('click', () => { if (startJudgeSession()) initialize(); });
gate.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  judgeName = gate.elements.judgeName.value;
  entryError.textContent = '';
  busy = true;
  const button = gate.querySelector('button');
  button.disabled = true;
  try {
    view = await api('open');
    render();
    const heading = content.querySelector('strong');
    heading.setAttribute('tabindex', '-1');
    heading.focus();
  } catch (problem) {
    entryError.textContent = problem.message;
  } finally {
    button.disabled = false;
    busy = false;
  }
});

content.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const form = event.target;
  const values = new FormData(form);
  const extra = judging ? {
    teamId: form.dataset.judge,
    scores: view.rubric.map((_, i) => Number(values.get('score' + i))),
  } : { teamIds: values.getAll('team') };
  const error = form.querySelector('.error');
  error.textContent = '';
  if (!judging && !extra.teamIds.length) {
    error.textContent = '투표할 작품을 한 개 이상 선택해 주세요.';
    return;
  }
  const button = form.querySelector('button');
  busy = true;
  button.disabled = true;
  try {
    view = await api('submit', extra);
    if (judging && view.status === 'open') {
      const team = view.teams.find(team => team.id === extra.teamId);
      if (team) {
        form.closest('article').outerHTML = judgeForm(team);
        content.querySelector('.summary p:last-child').textContent = '채점 완료 ' + view.teams.filter(team => team.scores).length + '/' + view.teams.length + '팀';
      } else render();
    } else render();
    notify(judging ? '심사 점수를 저장했습니다.' : '투표가 완료되었습니다.');
  } catch (problem) {
    error.textContent = problem.message;
  } finally {
    button.disabled = false;
    busy = false;
  }
});
content.addEventListener('click', async event => {
  if (busy) return;
  if (event.target.id === 'change-judge') {
    judgeName = undefined;
    await initialize();
    return;
  }
  if (event.target.id !== 'reload') return;
  busy = true;
  event.target.disabled = true;
  try {
    view = await api('open');
    render();
  } catch (problem) {
    notify(problem.message);
  } finally {
    event.target.disabled = false;
    busy = false;
  }
});

if (startJudgeSession()) initialize();
