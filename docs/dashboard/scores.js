export const rubric = [
  { "name": "창의적인 쓸데없음", "max": 30 },
  { "name": "작동 완성도", "max": 25 },
  { "name": "HW·SW 구현", "max": 20 },
  { "name": "재미와 표현력", "max": 15 },
  { "name": "설명서의 밤티력", "max": 10 }
];
export const isLegacyReview = review => review.scores.length === 4;
export const reviewTotal = review => review.scores.reduce((sum, score) => sum + score, 0);

function currentReviews(team) {
  return team.reviews.filter(review => !isLegacyReview(review));
}

export function judgeCount(team) {
  return currentReviews(team).length;
}

export function judgeAverage(team) {
  const reviews = currentReviews(team);
  if (!reviews.length) return null;
  const total = reviews.reduce((sum, review) => sum + reviewTotal(review), 0);
  return total / reviews.length;
}

export const voteClosed = settings => Date.now() >= Date.parse(settings.votingEnd + '+09:00') + 60000;

export function talliedTeams({ teams, settings, participation }) {
  const counts = new Map();
  for (const { teamIds } of participation?.memberBallots ?? []) {
    for (const id of teamIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const online = voteClosed(settings) || teams.some(team => counts.has(team.id));
  return teams.map(team => ({ ...team, votes: online ? counts.get(team.id) ?? 0 : null }));
}

export function tally(teams, expected) {
  const votes = teams.reduce((sum, team) => sum + (team.votes ?? 0), 0);
  const votesComplete = teams.length > 0 && teams.every(team => team.votes !== null);
  const rows = teams.map(team => {
    const average = judgeAverage(team);
    const judgePoints = average === null ? null : average * 0.8;
    const votePoints = votesComplete ? (votes ? team.votes / votes * 20 : 0) : null;
    const score = judgePoints === null || votePoints === null ? null : Math.round((judgePoints + votePoints) * 100) / 100;
    return { team, average, judgePoints, votePoints, score, rank: null };
  });
  rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  for (const [index, row] of rows.entries()) {
    if (row.score !== null) row.rank = rows[index - 1]?.score === row.score ? rows[index - 1].rank : index + 1;
  }
  return {
    rows, votes, votesComplete,
    ready: votesComplete && teams.every(team => judgeCount(team) === expected && team.doc && team.video),
  };
}
