const sitesOrigin = 'https://cecom-arduino-contest-26.calmhinny34.chatgpt.site';
const page = 'https://ziseogi.github.io/cecom-contest/dashboard/';

export function createDashboardBridge(onConnect, onDisconnect) {
  let popup;
  let channel;
  let nextId = 0;
  let connected = false;
  const pending = new Map();

  function disconnect() {
    channel?.close();
    channel = undefined;
    popup = undefined;
    connected = false;
    for (const { timer, reject } of pending.values()) {
      clearTimeout(timer);
      reject(new Error('관리자 인증 창을 다시 열어 주세요.'));
    }
    pending.clear();
    onDisconnect();
  }

  window.addEventListener('message', event => {
    if (!popup || event.origin !== sitesOrigin || event.source !== popup
        || event.data?.type !== 'cecom-dashboard-ready' || event.data.page !== page || channel) return;
    const { port1, port2 } = new MessageChannel();
    channel = port1;
    channel.onmessage = ({ data }) => {
      if (data?.type === 'cecom-dashboard-connected') {
        connected = true;
        onConnect();
        return;
      }
      const entry = pending.get(data?.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(data.id);
      if (data.status === 401) {
        entry.reject(new Error('대시보드에 다시 로그인해 주세요.'));
        popup?.close();
        disconnect();
        return;
      }
      entry.resolve(Response.json(data.body, { status: data.status }));
    };
    popup.postMessage({ type: 'cecom-dashboard-connect' }, sitesOrigin, [port2]);
  });

  setInterval(() => { if (popup?.closed) disconnect(); }, 1000);

  return {
    get connected() { return connected; },
    open() {
      if (popup && !popup.closed) {
        popup.focus();
        return true;
      }
      if (popup) disconnect();
      popup = window.open(sitesOrigin + '/github-connect', '_blank', 'popup,width=540,height=470');
      return Boolean(popup);
    },
    async request(options = {}) {
      let pdfBytes;
      if (options.pdf) {
        try {
          pdfBytes = await options.pdf.arrayBuffer();
        } catch {
          throw new Error('선택한 PDF를 읽을 수 없습니다. 파일을 다시 선택해 주세요.');
        }
      }
      if (!connected || popup?.closed) throw new Error('관리자 인증 창을 열어 주세요.');
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('대시보드 연결 시간이 초과되었습니다. 다시 시도해 주세요.'));
        }, options.pdf ? 90000 : 15000);
        pending.set(id, { resolve, reject, timer });
        channel.postMessage({ id, method: options.method ?? 'GET', body: options.body, pdfBytes }, pdfBytes ? [pdfBytes] : []);
      });
    },
  };
}
