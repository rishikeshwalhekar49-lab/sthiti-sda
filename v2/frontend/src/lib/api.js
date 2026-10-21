export function getJson(url) {
  return fetch(url, { cache: 'no-store' }).then((r) => r.json().then((j) => ({ status: r.status, body: j })));
}
export function postJson(url, body) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
}
