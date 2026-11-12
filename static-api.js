// Static-hosting shim: answers the app's two API calls without a server.
// Questions come from questions.json; progress is kept in this browser's storage.
(function () {
  var KEY = 'qfa-regulation-progress-store';
  var realFetch = window.fetch.bind(window);
  function json(body, status) {
    return Promise.resolve(new Response(body, { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }));
  }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url === '/api/questions') return realFetch('questions.json', { cache: 'no-cache' });
    if (url === '/api/progress') {
      var method = ((init && init.method) || 'GET').toUpperCase();
      if (method === 'PUT') {
        try { localStorage.setItem(KEY, init.body); } catch (e) { return json('{"ok":false}', 507); }
        return json('{"ok":true}');
      }
      var stored = null;
      try { stored = localStorage.getItem(KEY); } catch (e) {}
      return json(stored || '{}');
    }
    return realFetch(input, init);
  };
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();