// Service Worker for Family Todo PWA
// 版本号：每次发布新版 index.html 时必须修改 (v2, v3, ...)
const CACHE_NAME = 'family-todo-v17';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

// 仅缓存同源 GET 请求
const isCacheable = (request) => {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin;
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
  // 立即激活新 SW，不等旧 SW 控制的标签页关闭
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// ============ 截止日提醒中继（页面后台时接管调度）============
// 页面隐藏时会 postMessage { type: 'SCHEDULE_REMINDERS' } 推送任务快照，
// SW 在自身生命周期内每 60s 检查一次到期任务并弹系统通知。
// SW 被浏览器回收后（约数十秒~数分钟，系统策略决定）此机制失效，
// 直到用户再次打开页面。真正的离线 Push 需要 FCM + 服务端。
let reminderState = null;   // { todos: [{id,text,dueDate,listName}], remindHour, notified: {todoId: dueDate} }
let reminderTimer = null;
const REMINDER_CHECK_INTERVAL_MS = 60 * 1000;

function computeFireAt(dueDateStr, remindHour) {
  const due = new Date(dueDateStr + 'T00:00:00');
  if (isNaN(due.getTime())) return null;
  due.setHours(remindHour, 0, 0, 0);
  return due.getTime();
}

function swShowReminder(todo) {
  if (!self.registration || !self.registration.showNotification) return;
  const title = '清单提醒：' + (todo.text || '待办');
  const body = '截止日：' + todo.dueDate + (todo.listName ? ' · ' + todo.listName : '');
  self.registration.showNotification(title, {
    body: body,
    tag: 'todo-' + todo.id,
    renotify: true,
    requireInteraction: false
  });
  // 通知已发的标记回传给页面，页面据此更新 localStorage 去重表
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    clientList.forEach((client) => {
      client.postMessage({ type: 'TODO_NOTIFIED', id: todo.id, dueDate: todo.dueDate });
    });
  }).catch(() => {});
}

function checkReminders() {
  if (!reminderState || !Array.isArray(reminderState.todos)) return;
  // 页面当前可见时本轮跳过（页面侧 setTimeout/toast 负责提醒），
  // 避免 hidden→visible 切换的轮询窗口内双通道重复弹通知。
  // 注意: notified 不写, 下一轮(页面不可见或已离开)仍可接续。
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    const hasVisible = clientList.some((c) => c.visibilityState === 'visible');
    if (hasVisible) return;
    const now = Date.now();
    const hour = reminderState.remindHour || 9;
    reminderState.todos.forEach((todo) => {
      if (!todo || todo.done || !todo.dueDate) return;
      const fireAt = computeFireAt(todo.dueDate, hour);
      if (fireAt === null || now < fireAt) return;
      if (reminderState.notified && reminderState.notified[todo.id] === todo.dueDate) return;
      swShowReminder(todo);
      if (!reminderState.notified) reminderState.notified = {};
      reminderState.notified[todo.id] = todo.dueDate;
    });
  }).catch(() => {});
}

self.addEventListener('message', (event) => {
  // 支持页面主动调用 skipWaiting 或清理缓存
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    );
  }
  // 页面进入后台：接管提醒调度
  if (event.data && event.data.type === 'SCHEDULE_REMINDERS') {
    reminderState = event.data.payload || {};
    if (reminderTimer) clearInterval(reminderTimer);
    reminderTimer = setInterval(checkReminders, REMINDER_CHECK_INTERVAL_MS);
    checkReminders();
  }
  // 页面回到前台：交还调度权，停止 SW 侧定时器
  if (event.data && event.data.type === 'CANCEL_REMINDERS') {
    if (reminderTimer) { clearInterval(reminderTimer); reminderTimer = null; }
    reminderState = null;
  }
});

// 点击通知：聚焦已打开的页面，否则新开窗口
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow('./');
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 非 GET（如 POST/PUT）或跨域请求：直接走网络，不走缓存策略
  if (!isCacheable(request)) {
    event.respondWith(fetch(request));
    return;
  }

  // 策略：Stale-While-Revalidate
  // 命中缓存时立即返回旧副本，同时后台拉取新版，下次刷新即生效。
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});