import { createDashboardBridge } from './bridge.js';
import { isLegacyReview, judgeAverage, judgeCount, reviewTotal, rubric, tally, talliedTeams, voteClosed } from './scores.js';

const labels = {
  overview: '운영 현황', teams: '팀 및 제출물', judging: '심사위원 점수',
  votes: '부원 투표', ranking: '최종 순위', settings: '일정 관리', participation: '참여 링크·심사위원',
};
const progress = { preparing: '준비 중', working: '제작 중', finished: '제작 완료' };
const main = document.querySelector('#main');
const dialog = document.querySelector('#dialog');
const dialogContent = document.querySelector('#dialog-content');
const refresh = document.querySelector('#refresh');
const toast = document.querySelector('#toast');
let state;
let currentView;
let busy = false;
let toastTimer;
let loading = false;
const participantLinks = {
  judge: 'https://ziseogi.github.io/cecom-contest/judge/',
  vote: 'https://ziseogi.github.io/cecom-contest/vote/',
};
const participationOf = data => data.participation ?? { judges: [], voters: [], ballots: [] };

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const icon = name => '<svg aria-hidden="true"><use href="#' + name + '"/></svg>';
const button = (label, action, symbol, classes = '', id = '') =>
  `<button type="button" class="button ${classes}" data-action="${action}" data-id="${esc(id)}">${symbol ? icon(symbol) : ''}${label}</button>`;
const link = (label, view, symbol, classes = 'text') =>
  `<a class="button ${classes}" href="#${view}">${label}${symbol ? icon(symbol) : ''}</a>`;
const badge = (label, tone = '') => `<span class="badge ${tone}"><i class="dot"></i>${label}</span>`;
const submitted = team => Boolean(team.doc && team.video);
const submitBadge = team => submitted(team) ? badge('제출 완료', 'good')
  : team.doc || team.video ? badge('일부 제출', 'warn') : badge('미제출');
const progressBadge = team => badge(progress[team.progress], team.progress === 'finished' ? 'good' : '');
const points = score => score === null ? '—' : score.toFixed(2);
const integer = value => value.toLocaleString('ko-KR');
const count = (list, predicate) => list.filter(predicate).length;
const editTeam = team => button('편집', 'edit-team', '', 'secondary small', team.id);
const teamName = team => `<strong>${esc(team.name)}</strong><small>${esc(team.work || '작품명 미등록')}</small>`;
const addTeam = () => button('팀 추가', 'add-team', 'plus');
const settingsLink = () => link('일정 수정', 'settings', 'arrow');

function date(value) {
  const [day, time] = value.split('T');
  const [year, month, dayNum] = day.split('-').map(Number);
  const weekday = '일월화수목금토'[new Date(Date.UTC(year, month - 1, dayNum)).getUTCDay()];
  return `${month}월 ${dayNum}일(${weekday}) ${time}`;
}
function fileLinks(team) {
  const item = (url, label, symbol) => url
    ? `<a class="button secondary small" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${icon(symbol)}${label}</a>`
    : `<span class="badge">${label} 미등록</span>`;
  return `<div class="mini-links">${item(team.doc, '작품 설명서', 'file')}${item(team.video, '시연 영상', 'play')}</div>`;
}
function empty(symbol, title, detail, action = '') {
  return `<div class="empty"><span class="empty-icon">${icon(symbol)}</span><strong>${title}</strong><p>${detail}</p>${action}</div>`;
}
function head(kicker, view, desc, action = '') {
  return `<div class="view-head"><div><p class="eyebrow">${kicker}</p><h1>${labels[view]}</h1><p class="subtle">${desc}</p></div>${action}</div>`;
}
function table(headers, rows, label) {
  return `<div class="table-wrap"><table aria-label="${label}"><thead><tr>${headers.map(header => `<th scope="col">${header}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

const heroArt = `<svg class="hero-art" aria-hidden="true" viewBox="0 0 390 230">
  <g stroke="#a28f79" opacity=".36"><path d="M20 62h54l28-28h39m-95 120h45l23-23m167-91h49l19 19h29M279 187h45l17-17h31M50 199h43l21-20m211-61h46"/><circle cx="18" cy="62" r="4"/><circle cx="44" cy="154" r="4"/><circle cx="48" cy="199" r="4"/><circle cx="378" cy="59" r="4"/><circle cx="373" cy="170" r="4"/><circle cx="373" cy="118" r="4"/></g>
  <g transform="translate(194 112) rotate(-11)" stroke="#203b30">
    <rect x="-93" y="-62" width="194" height="136" rx="17" fill="#dfc8ad" stroke="none" transform="translate(7 9)"/>
    <rect x="-93" y="-62" width="194" height="136" rx="17" fill="#315847" stroke-width="2"/>
    <path d="M-72 47h36l18-18m31-62h27l13-13m12 70h-27l-15-15m-30 47 18-17h31l13 15h24M-63-21h33l15 16" stroke="#9cc3a9"/>
    <rect x="-112" y="-24" width="41" height="35" rx="5" fill="#f1e6d8" stroke-width="2"/>
    <path d="M-106-14h18m-18 13h18" stroke="#8b8071"/>
    <rect x="-28" y="-22" width="65" height="58" rx="8" fill="#182c23" stroke="#c1dbc3"/>
    <path d="M-16-29v7m13-7v7m13-7v7m13-7v7m-39 58v8m13-8v8m13-8v8m13-8v8m-58-53h7m-7 14h7m-7 14h7m65-28h7m-7 14h7m-7 14h7" stroke="#c1dbc3"/>
    <path d="M-5 6h17m-8-8v16" stroke="#ff9b7c" stroke-width="2"/>
    <rect x="-54" y="-53" width="79" height="12" rx="3" fill="#172c23"/>
    <path d="M-44-47h0m11 0h0m11 0h0m11 0h0m11 0h0m11 0h0" stroke="#e7c88c" stroke-width="3"/>
    <circle cx="73" cy="-32" r="13" fill="#ff744e" stroke-width="2"/><circle cx="73" cy="-32" r="6" fill="#ffc0a7" stroke="none"/>
    <circle cx="-76" cy="-47" r="4" fill="#e9e2c8"/><circle cx="85" cy="59" r="4" fill="#e9e2c8"/>
  </g>
  <path d="M298 27v20m-10-10h20m22 24v12m-6-6h12M92 183v16m-8-8h16" stroke="#aa4c30" stroke-width="2"/>
</svg>`;

function overview(data) {
  const { teams, settings } = data;
  const totalVotes = tally(talliedTeams(data), settings.judgeCount).votes;
  const reviews = teams.reduce((total, team) => total + judgeCount(team), 0);
  const metric = (name, value, detail, symbol, orange = false) =>
    `<div class="metric"><div class="metric-top"><span class="icon-box ${orange ? 'orange' : ''}">${icon(symbol)}</span>${name}</div><strong>${value}</strong><small>${detail}</small></div>`;
  const rows = teams.map(team => `<tr><td>${teamName(team)}</td><td>${progressBadge(team)}</td><td>${submitBadge(team)}</td><td>${editTeam(team)}</td></tr>`).join('');
  return `<section class="hero"><div class="hero-content"><p class="eyebrow"><span>2026 · 2학기</span> CECOM CONTEST</p>
    <h1>아두이노로<br>쓸데없는 물건 만들기</h1><p class="desc">팀별 진행 상황부터 작품 제출, 심사와 최종 순위까지 한곳에서 관리합니다.</p>${addTeam()}</div>${heroArt}</section>
    <section class="metrics" aria-label="대회 지표">
      ${metric('등록 팀', teams.length + '팀', '대시보드에 추가한 참가 팀', 'folder')}
      ${metric('제출 완료', count(teams, submitted) + '팀', '설명서와 영상 모두 등록', 'file')}
      ${metric('심사 입력', reviews + '건', '예정 ' + teams.length * settings.judgeCount + '건 · 최종 점수의 80%', 'clipboard', true)}
      ${metric('부원 투표', integer(totalVotes) + '표', '사이트 투표 · 최종 점수의 20%', 'vote', true)}
    </section>
    <div class="overview-bottom"><section class="panel"><div class="panel-head"><div><h2>팀별 진행 및 제출 현황</h2><p class="subtle">작품 제작 상태와 제출 여부를 확인합니다.</p></div>${link('전체 보기', 'teams', 'arrow')}</div>
    ${rows ? table(['팀 / 작품', '제작 상태', '제출 여부', '관리'], rows, '팀별 진행 및 제출 현황') : empty('folder','아직 등록된 팀이 없습니다.','참가 팀을 추가하면 이곳에 진행 상태가 표시됩니다.')}
    </section><section class="panel"><div class="panel-head"><div><h2>주요 일정</h2><p class="subtle">한국 시간 · KST</p></div>${settingsLink()}</div>
    <div class="schedule"><div class="event"><span class="icon-box">${icon('calendar')}</span><div><strong>심사 기간</strong><span class="subtle">${date(settings.judgingStart)} ~</span><span class="subtle">${date(settings.judgingEnd)}</span></div></div>
    <div class="event"><span class="icon-box orange">${icon('vote')}</span><div><strong>부원 투표 마감</strong><span class="subtle">${date(settings.votingEnd)}</span></div></div></div></section></div>`;
}

function teamsView({ teams }) {
  const cards = teams.map(team => `<article class="panel team-card"><div class="topline"><div class="badges">${progressBadge(team)}${submitBadge(team)}</div>${editTeam(team)}</div>
    <h2>${esc(team.name)}</h2><p class="subtle">${esc(team.work || '작품명 미등록')}</p><div class="actions">${fileLinks(team)}</div></article>`).join('');
  return head('SUBMISSIONS', 'teams', '참가 팀의 제작 상태와 작품 설명서·시연 영상 링크를 관리합니다.', addTeam())
    + (cards ? `<div class="team-grid">${cards}</div>` : `<div class="panel">${empty('folder','아직 등록된 팀이 없습니다.','팀 이름부터 등록하고 작품 정보는 나중에 추가할 수 있습니다.', addTeam())}</div>`);
}

function judgingView({ teams, settings }) {
  const cards = teams.map(team => {
    const average = judgeAverage(team);
    const rows = team.reviews.map((review, index) => {
      const legacy = isLegacyReview(review);
      const cells = legacy
        ? `<td colspan="${rubric.length + 1}"><span class="badge warn">이전 기준</span> ${reviewTotal(review)}점 · 새 기준으로 다시 입력해 주세요.</td>`
        : review.scores.map(score => `<td>${score}</td>`).join('') + `<td class="score">${reviewTotal(review)}</td>`;
      return `<tr><td>${esc(review.name)}${review.online ? ' <span class="badge good">온라인</span>' : ''}</td>${cells}<td><button class="button secondary small" type="button" data-action="edit-review" data-id="${esc(team.id)}" data-index="${index}">${legacy ? '다시 입력' : '수정'}</button></td></tr>`;
    }).join('');
    return `<section class="panel space"><div class="panel-head"><div><h2>${esc(team.name)} · ${esc(team.work || '작품명 미등록')}</h2><p class="subtle">입력 ${judgeCount(team)}/${settings.judgeCount}명 · 평균 ${points(average)}점</p></div>${button('점수 입력','add-review','plus','',team.id)}</div>
      <div class="actions field-note">${fileLinks(team)}</div>
      ${rows ? table(['심사위원', ...rubric.map(item => item.name), '합계', '관리'], rows, '심사위원 점수') : '<p class="subtle field-note">아직 등록된 심사 점수가 없습니다.</p>'}</section>`;
  }).join('');
  return head('JUDGING · 80%', 'judging', `심사 기간 · ${date(settings.judgingStart)} ~ ${date(settings.judgingEnd)} (KST)`)
    + `<section class="panel space"><h2>평가 항목</h2><p class="subtle">심사위원별 100점 만점으로 입력합니다. 팀별 심사위원 총점 평균을 80점 만점으로 환산합니다.</p><ul class="rubric">${rubric.map(({ name, max }) => `<li>${name}<small>${max}점 만점</small></li>`).join('')}</ul></section>`
    + (cards || `<div class="panel">${empty('clipboard','심사할 팀이 없습니다.','팀을 추가하면 심사위원별 점수를 입력할 수 있습니다.', link('팀 및 제출물로 이동','teams','arrow','secondary'))}</div>`);
}

function votesView(data) {
  const { settings } = data;
  const teams = talliedTeams(data);
  const rows = teams.map(team => `<tr><td>${teamName(team)}</td><td class="numeric">${integer(team.votes ?? 0)}</td></tr>`).join('');
  const { votes } = tally(teams, settings.judgeCount);
  return head('MEMBER VOTE · 20%', 'votes', `투표 마감 · ${date(settings.votingEnd)} (KST)`, link('참여 링크·심사위원','participation','arrow'))
    + (rows ? `<div class="summary"><strong>사이트 득표 합계 ${integer(votes)}표</strong></div>
    <section class="panel"><h2>팀별 득표수</h2><p class="subtle">부원 투표 사이트에 제출된 표가 자동으로 집계됩니다.</p>
    ${table(['팀 / 작품', '득표수'], rows, '팀별 득표수')}</section>`
    : `<div class="panel">${empty('vote','집계할 팀이 없습니다.','팀을 추가하면 각 팀의 득표수를 확인할 수 있습니다.', link('팀 및 제출물로 이동','teams','arrow','secondary'))}</div>`);
}

function rankingView(data) {
  const { teams, settings } = data;
  const result = tally(talliedTeams(data), settings.judgeCount);
  const awaitingVotes = !voteClosed(settings);
  const ready = result.ready && !awaitingVotes;
  const rows = result.rows.map(row => `<tr><td class="score">${row.rank === null ? '—' : row.rank + '위'}</td><td>${teamName(row.team)}</td><td class="numeric">${judgeCount(row.team)}/${settings.judgeCount}</td>
    <td class="numeric">${points(row.judgePoints)}</td><td class="numeric">${row.team.votes === null ? '—' : integer(row.team.votes)}</td><td class="numeric">${points(row.votePoints)}</td><td class="score">${points(row.score)}</td></tr>`).join('');
  const detail = ready ? '모든 팀의 제출물, 예정 심사 건수, 사이트 투표 결과를 확인했습니다.'
    : awaitingVotes ? '온라인 투표 진행 중에는 잠정 순위가 표시됩니다.' : '모든 팀의 제출물, 예정 심사 건수, 투표 결과가 갖춰지면 최종 집계로 표시됩니다.';
  return head('LEADERBOARD', 'ranking', '심사 점수 80%와 부원 투표 20%를 합산해 순위를 계산합니다.')
    + `<section class="panel"><div class="top-result"><h2>작품별 순위</h2>${badge(ready ? '최종 집계' : '집계 중', ready ? 'good' : 'warn')}</div><p class="subtle">${detail}</p>
    ${rows ? table(['순위', '팀 / 작품', '심사 인원', '심사 / 80', '득표수', '투표 / 20', '최종 / 100'], rows, '작품별 최종 순위') : empty('trophy','아직 집계할 작품이 없습니다.','팀 등록과 점수 입력을 마치면 순위가 표시됩니다.')}
    <p class="calc-detail">심사 점수는 심사위원 총점 평균 × 0.8, 투표 점수는 팀 득표수 ÷ 전체 유효표 × 20입니다. 전체 유효표가 0표이면 투표 점수는 0점입니다. 최종 점수를 소수점 둘째 자리까지 반올림해 비교하고, 동점은 공동 순위로 표시합니다.</p></section>`;
}

function settingsView({ settings }) {
  return head('CONTEST SETTINGS', 'settings', '운영 화면에 표시할 일정과 팀당 예정 심사위원 수를 수정합니다.')
    + `<section class="panel setting-panel"><h2>대회 일정 및 심사 인원</h2><p class="subtle">한국 시간(KST) 기준입니다. 마감 이후에도 운영자가 입력값을 수정할 수 있습니다.</p>
    <form data-form="settings"><div class="form-grid">
      <label>심사 시작<input type="datetime-local" name="judgingStart" required value="${settings.judgingStart}"></label>
      <label>심사 마감<input type="datetime-local" name="judgingEnd" required value="${settings.judgingEnd}"></label>
      <label>투표 마감<input type="datetime-local" name="votingEnd" required value="${settings.votingEnd}"></label>
      <label>팀당 예정 심사위원 수<input type="number" name="judgeCount" required min="1" max="30" value="${settings.judgeCount}"></label>
    </div><p class="error-text" role="alert"></p><div class="form-actions"><button class="button">일정 및 심사 인원 저장</button></div></form></section>`;
}

function participationView(data) {
  const { judges, memberRosterProofs = [], memberBallots = [] } = participationOf(data);
  const address = (role, label) => `<div class="actions"><a class="button secondary" href="${participantLinks[role]}" target="_blank" rel="noopener noreferrer">${label} 열기</a>${button('주소 복사', 'copy-address', '', 'text', role)}</div>`;
  const judgeRows = judges.map(judge => `<tr><td>${esc(judge.name)}</td><td><form data-form="judge-manage"><input type="hidden" name="name" value="${esc(judge.name)}"><div class="actions">${judge.browserId ? '<button class="button secondary small" name="intent" value="reset">브라우저 연결 해제</button>' : ''}<button class="button secondary small" name="intent" value="delete">명단에서 제거</button></div><p class="error-text" role="alert"></p></form></td></tr>`).join('');
  return head('PARTICIPATION', 'participation', '채점과 투표 링크를 공유하면 제출 결과가 자동으로 들어옵니다.')
    + `<section class="panel space"><h2>심사위원 채점</h2><p class="subtle">등록한 이름만 심사 사이트에 표시됩니다. 심사위원이 브라우저를 바꿔야 하는 경우 기존 연결을 해제해 주세요.</p>${address('judge','심사위원 사이트')}
    <form data-form="judge-add"><div class="form-grid field-note"><label>심사위원 이름<input name="name" required maxlength="50"></label></div><p class="error-text" role="alert"></p><button class="button">이름 등록</button></form>
    ${judgeRows ? table(['심사위원','관리'], judgeRows, '심사위원 명단') : ''}</section>
    <section class="panel"><h2>CECOM 부원 투표</h2><p class="subtle">명단에 등록된 이름과 학번이 일치해야 참여할 수 있으며, 학번당 한 번 제출할 수 있습니다.</p>${address('vote','부원 투표 사이트')}
    <p class="subtle field-note">인증 명단 ${memberRosterProofs.length}명 · 투표 제출 ${memberBallots.length}건</p>
    <form data-form="member-roster"><label>투표 대상 이름·학번 명단<textarea name="roster" rows="5" maxlength="135000" required placeholder="한 줄에 이름,학번 형식으로 입력하세요"></textarea></label>
    <p class="subtle field-note">예시 형식은 홍길동,1234567입니다. 스프레드시트에서 이름과 학번 두 열을 붙여넣어도 됩니다. 새 명단을 저장해도 제출된 투표는 보존되며 이름과 학번 원문은 저장하지 않습니다.</p>
    <p class="error-text" role="alert"></p><button class="button">부원 명단 저장</button></form></section>`;
}

const views = { overview, teams: teamsView, judging: judgingView, votes: votesView, ranking: rankingView, settings: settingsView, participation: participationView };
function render() {
  const route = location.hash.slice(1);
  const nextView = Object.hasOwn(views, route) ? route : 'overview';
  if (nextView !== currentView) window.scrollTo(0, 0);
  currentView = nextView;
  document.querySelector('#crumb').textContent = labels[currentView];
  for (const item of document.querySelectorAll('[data-view]')) {
    if (item.dataset.view === currentView) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  if (state) main.innerHTML = views[currentView](state.data);
}

function notify(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('visible');
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 4000);
}
function connection(message, failed = false) {
  document.querySelector('#sync-text').textContent = message;
  refresh.classList.toggle('error', failed);
  refresh.title = '서버에서 최신 데이터 불러오기';
}
async function load(silent = false) {
  if (busy || loading) return;
  loading = true;
  const previous = state?.revision;
  if (!silent) {
    refresh.disabled = true;
    connection('불러오는 중');
    main.setAttribute('aria-busy', 'true');
  }
  try {
    const res = await bridge.request();
    if (!res.ok) throw new Error();
    const updated = await res.json();
    if (busy || (silent && editing())) return;
    state = updated;
    if (!silent || previous !== state.revision || currentView === 'ranking') render();
    connection('서버 연결됨');
  } catch {
    if (silent || !bridge.connected) return;
    connection('연결 실패 · 새로고침', true);
    if (!state) main.innerHTML = '<div class="panel loading">데이터를 불러오지 못했습니다. 상단 버튼을 눌러 다시 시도해 주세요.</div>';
    else notify('데이터를 불러오지 못했습니다.');
  } finally {
    loading = false;
    refresh.disabled = false;
    main.removeAttribute('aria-busy');
  }
}

function showDialog(title, content) {
  dialogContent.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${title}</h2><button type="button" class="close" data-action="close" aria-label="닫기">${icon('close')}</button></div>${content}`;
  dialog.setAttribute('aria-labelledby','dialog-title');
  dialog.showModal();
}

function showTeam(team) {
  const options = Object.entries(progress).map(([key, label]) =>
    `<option value="${key}" ${team?.progress === key ? 'selected' : ''}>${label}</option>`).join('');
  showDialog(team ? '팀 및 제출물 편집' : '참가 팀 추가', `<p class="dialog-note">설명서와 영상 링크가 모두 등록되면 제출 완료로 표시됩니다.</p>
    <form data-form="team" data-id="${esc(team?.id)}"><div class="form-grid">
    <label>팀 이름<input name="name" required maxlength="60" value="${esc(team?.name)}" autofocus></label>
    <label>제작 상태<select name="progress">${options}</select></label>
    <label class="full">작품명<input name="work" maxlength="100" value="${esc(team?.work)}"></label>
    <label class="full">작품 설명서 링크<input name="doc" type="url" maxlength="2048" placeholder="https://…" value="${esc(team?.doc)}"></label>
    <label class="full">시연 영상 링크<input name="video" type="url" maxlength="2048" placeholder="https://…" value="${esc(team?.video)}"></label></div>
    <p class="error-text" role="alert"></p><div class="form-actions">${team ? '<button class="button danger" name="intent" value="delete" formnovalidate>팀 삭제</button>' : ''}${button('취소','close','','secondary')}<button class="button">저장</button></div></form>`);
}

function showReview(team, index) {
  const review = team.reviews[index];
  const legacy = review && isLegacyReview(review);
  showDialog(legacy ? '새 기준으로 심사 점수 입력' : review ? '심사 점수 수정' : '심사 점수 입력', `<p class="dialog-note">${esc(team.name)} · 항목별 배점에 맞춰 입력하세요. 한 팀에서 같은 심사위원 이름을 저장하면 해당 점수가 갱신됩니다.</p>
    ${legacy ? `<p class="dialog-note">이전 기준 항목별 점수 ${review.scores.join(' / ')}점 · 총 ${reviewTotal(review)}점</p>` : ''}
    <form data-form="review" data-id="${esc(team.id)}" data-index="${index ?? ''}"><div class="form-grid">
    <label class="full">심사위원 이름<input name="reviewer" required maxlength="50" value="${esc(review?.name)}" autofocus></label>
    ${rubric.map(({ name, max }, i) => `<label>${name} (${max}점)<input name="score${i}" type="number" min="0" max="${max}" step="1" required value="${legacy ? '' : review?.scores[i] ?? ''}"></label>`).join('')}</div>
    <p class="error-text" role="alert"></p><div class="form-actions">${review ? '<button class="button danger" name="intent" value="delete" formnovalidate>점수 삭제</button>' : ''}${button('취소','close','','secondary')}<button class="button">점수 저장</button></div></form>`);
}

function applyForm(data, form, event) {
  const values = new FormData(form);
  const text = key => String(values.get(key) ?? '').trim();
  const team = data.teams.find(item => item.id === form.dataset.id);
  const deletion = event.submitter?.value === 'delete';
  switch (form.dataset.form) {
    case 'team': {
      if (deletion && team) {
        if (!confirm(team.name + '의 제출물 링크, 심사 점수 및 투표 기록을 삭제하시겠습니까?')) return false;
        data.teams = data.teams.filter(item => item.id !== team.id);
        return '팀을 삭제했습니다.';
      }
      const fields = { name: text('name'), work: text('work'), progress: text('progress'), doc: text('doc'), video: text('video') };
      if (!fields.name) throw new Error('팀 이름을 입력해 주세요.');
      if ([fields.doc, fields.video].some(url => url && !/^https?:\/\//i.test(url))) {
        throw new Error('링크는 https:// 또는 http://로 시작해야 합니다.');
      }
      if (team) Object.assign(team, fields);
      else {
        if (data.teams.length >= 100) throw new Error('팀은 최대 100개까지 등록할 수 있습니다.');
        data.teams.push({ id: crypto.randomUUID(), ...fields, reviews: [], votes: null });
      }
      return '팀 정보를 저장했습니다.';
    }
    case 'review': {
      if (!team) throw new Error('팀 정보를 불러올 수 없습니다.');
      const editIndex = form.dataset.index === '' ? -1 : Number(form.dataset.index);
      if (deletion && editIndex >= 0) {
        if (!confirm('이 심사위원의 점수를 삭제하시겠습니까?')) return false;
        team.reviews.splice(editIndex, 1);
        return '심사 점수를 삭제했습니다.';
      }
      const name = text('reviewer');
      if (!name) throw new Error('심사위원 이름을 입력해 주세요.');
      const existing = team.reviews.findIndex(review => review.name === name);
      if (editIndex >= 0 && existing >= 0 && editIndex !== existing) {
        throw new Error('같은 이름의 심사위원 점수가 이미 등록되어 있습니다.');
      }
      const index = editIndex >= 0 ? editIndex : existing;
      const review = { name, scores: rubric.map((_, i) => Number(text('score' + i))) };
      if (index >= 0) team.reviews[index] = review;
      else {
        if (team.reviews.length >= 30) throw new Error('팀별 심사 점수는 최대 30명까지 등록할 수 있습니다.');
        team.reviews.push(review);
      }
      return '심사 점수를 저장했습니다.';
    }
    case 'judge-add': {
      const name = text('name');
      const participation = data.participation ??= participationOf(data);
      if (!name) throw new Error('심사위원 이름을 입력해 주세요.');
      if (participation.judges.some(judge => judge.name === name)) throw new Error('이 이름의 심사위원이 이미 등록되어 있습니다.');
      if (participation.judges.length >= 30) throw new Error('심사위원은 최대 30명까지 등록할 수 있습니다.');
      participation.judges.push({ name });
      return '심사위원 이름을 등록했습니다.';
    }
    case 'judge-manage': {
      const participation = participationOf(data);
      const judge = participation.judges.find(item => item.name === text('name'));
      if (!judge) throw new Error('심사위원 이름을 찾을 수 없습니다.');
      if (deletion) {
        participation.judges = participation.judges.filter(item => item !== judge);
        return '심사위원을 명단에서 제거했습니다. 저장된 점수는 집계에 남아 있습니다.';
      }
      delete judge.browserId;
      return '심사위원의 브라우저 연결을 해제했습니다.';
    }
    case 'member-roster':
      return '투표 대상 이름·학번 명단을 저장했습니다.';
    case 'settings': {
      const settings = {
        judgingStart: text('judgingStart'), judgingEnd: text('judgingEnd'),
        votingEnd: text('votingEnd'), judgeCount: Number(text('judgeCount')),
      };
      if (settings.judgingEnd < settings.judgingStart) throw new Error('심사 마감은 심사 시작 이후로 설정해 주세요.');
      data.settings = settings;
      return '일정과 심사 인원을 저장했습니다.';
    }
    default:
      return false;
  }
}

document.addEventListener('submit', async event => {
  const form = event.target;
  if (!form.matches('form[data-form]')) return;
  event.preventDefault();
  if (!state || busy) return;
  const error = form.querySelector('.error-text');
  error.textContent = '';
  let message;
  const data = structuredClone(state.data);
  try {
    message = applyForm(data, form, event);
    if (!message) return;
  } catch (problem) {
    error.textContent = problem.message;
    return;
  }
  busy = true;
  refresh.disabled = true;
  const controls = [...form.elements];
  controls.forEach(control => control.disabled = true);
  connection('저장 중');
  try {
    const res = await bridge.request({
      method: 'PUT',
      body: JSON.stringify({ rubricVersion: 6, revision: state.revision, data, rosterText: form.dataset.form === 'member-roster' ? form.elements.roster.value : undefined }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);
    state = result;
    if (dialog.open) dialog.close();
    render();
    connection('서버에 저장됨');
    notify(message);
  } catch (problem) {
    error.textContent = problem.message === 'Failed to fetch'
      ? '저장할 수 없습니다. 연결을 확인하고 다시 시도해 주세요.' : problem.message;
    connection('저장 실패', true);
  } finally {
    busy = false;
    refresh.disabled = false;
    controls.forEach(control => control.disabled = false);
  }
});

document.addEventListener('click', async event => {
  const trigger = event.target.closest('[data-action]');
  if (!trigger || busy) return;
  const { action, id, index } = trigger.dataset;
  const team = state?.data.teams.find(item => item.id === id);
  if (action === 'copy-address') {
    const value = participantLinks[id];
    try {
      await navigator.clipboard.writeText(value);
      notify('복사했습니다.');
    } catch {
      notify('복사할 수 없습니다. 화면의 주소를 직접 복사해 주세요.');
    }
  }
  if (action === 'close') dialog.close();
  if (action === 'add-team') showTeam();
  if (action === 'edit-team' && team) showTeam(team);
  if (action === 'add-review' && team) showReview(team);
  if (action === 'edit-review' && team) showReview(team, Number(index));
});
dialog.addEventListener('cancel', event => {
  if (busy) event.preventDefault();
});
window.addEventListener('hashchange', render);
const editing = () => dialog.open || main.contains(document.activeElement) && document.activeElement.matches('input, select, textarea')
  || Boolean(main.querySelector('form[data-dirty]'));
main.addEventListener('input', event => {
  if (event.target.form) event.target.form.dataset.dirty = '';
});
const bridge = createDashboardBridge(() => load(), () => {
  state = undefined;
  if (dialog.open) dialog.close();
  showSignIn('인증 창이 닫혔습니다. 대시보드를 계속 사용하려면 다시 연결해 주세요.');
});

function showSignIn(message = '운영진 계정으로 연결한 뒤 대시보드를 사용할 수 있습니다.') {
  main.removeAttribute('aria-busy');
  connection('관리자 인증');
  refresh.title = '관리자 인증 창 열기';
  main.innerHTML = `<section class="panel">
    <h1>운영 대시보드</h1>
    <p role="status">${esc(message)}</p>
    <p>인증 창에서 <strong>이 탭에 대시보드 연결</strong>을 누르고, 운영 중에는 창을 열어두세요.</p>
    <button id="open-bridge" type="button" class="button">관리자 인증 창 열기</button>
    <a class="button secondary" href="https://cecom-arduino-contest-26.calmhinny34.chatgpt.site/" target="_blank" rel="noopener noreferrer">기존 대시보드 열기</a>
  </section>`;
}

function openBridge() {
  if (!bridge.open()) showSignIn('팝업을 허용한 뒤 관리자 인증 창을 다시 열어 주세요.');
}

main.addEventListener('click', event => {
  if (event.target.closest('#open-bridge')) openBridge();
});
refresh.addEventListener('click', () => bridge.connected ? load() : openBridge());
setInterval(() => {
  if (bridge.connected && !document.hidden && !editing()) load(true);
}, 10000);
render();
showSignIn();
