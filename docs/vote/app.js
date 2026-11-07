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
let voterIdentity;
let view;
let busy = false;
let toastTimer;

async function api(action, extra = {}) {
  const res = await fetch('https://cecom-arduino-contest-26-vote.calmhinny34.chatgpt.site/api/pages-entry', {
    method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
  });
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
  return `<form id="ballot"><div class="grid">${cards}</div>${canVote ? '<div class="vote-action"><button>선택한 작품에 투표하기</button><p class="muted">등록된 학번당 한 번 제출할 수 있으며, 여러 작품을 선택할 수 있습니다.</p><p class="error" role="alert"></p></div>' : ''}</form>`;
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

function initialize() {
  entry.hidden = false;
  content.hidden = true;
  gate.hidden = false;
  retry.hidden = true;
  entryHelp.textContent = '등록된 이름과 학번을 입력하면 작품을 볼 수 있습니다.';
}

gate.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const identity = {
    voterName: gate.elements.voterName.value.trim(),
    studentId: gate.elements.studentId.value.trim(),
  };
  entryError.textContent = '';
  busy = true;
  const button = gate.querySelector('button');
  button.disabled = true;
  try {
    view = await api('open', identity);
    voterIdentity = identity;
    gate.reset();
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
  } : { teamIds: values.getAll('team'), ...voterIdentity };
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
  if (event.target.id !== 'reload') return;
  busy = true;
  event.target.disabled = true;
  try {
    view = await api('open', voterIdentity);
    render();
  } catch (problem) {
    notify(problem.message);
  } finally {
    event.target.disabled = false;
    busy = false;
  }
});

initialize();
