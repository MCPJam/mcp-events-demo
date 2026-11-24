export function landing() {
  return new Response(
    String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MCP Events Demo · MCPJam</title>
<style>
:root{color-scheme:light;--ink:#242421;--muted:#77776e;--line:#dfdfd7;--accent:#dc7856}*{box-sizing:border-box}body{margin:0;background:#f7f7f2;color:var(--ink);font:15px/1.6 system-ui,-apple-system,sans-serif}main{max-width:850px;margin:auto;padding:48px 28px 64px}nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:70px}a{color:inherit;text-underline-offset:4px}nav a{color:var(--muted);font-size:13px}.brand{font-weight:750;font-size:22px;letter-spacing:-.7px}.brand span{color:var(--accent)}.eyebrow{font-size:12px;font-weight:600;letter-spacing:1.8px;text-transform:uppercase;color:var(--muted)}h1{font-size:clamp(38px,7vw,60px);line-height:1.1;letter-spacing:-2.5px;font-weight:620;margin:16px 0 22px}p{margin:0 0 20px}.lead{font-size:18px;color:var(--muted);max-width:590px}.pills{display:flex;gap:8px;margin:26px 0 34px}.pill{font-size:12px;border:1px solid var(--line);border-radius:20px;padding:4px 12px}.panel{background:#fff;border:1px solid var(--line);border-radius:14px;padding:28px;margin-top:28px}.panel-top{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}h2{font-size:19px;line-height:1.3;margin:0 0 6px;font-weight:600}.muted{color:var(--muted);font-size:13px;margin:0}button{font:inherit;cursor:pointer;border:0;border-radius:7px;padding:10px 16px;background:var(--ink);color:white;font-weight:550;white-space:nowrap}button:hover{background:#45453f}button:disabled{opacity:.5;cursor:wait}.connection{margin-top:26px;border-top:1px solid var(--line);padding-top:22px}label{display:block;font-weight:600;font-size:12px;margin-bottom:6px}.field{display:flex;gap:8px;margin-bottom:16px}input,textarea{font:12px/1.5 ui-monospace,SFMono-Regular,monospace;color:var(--ink);padding:12px;background:#f7f7f4;border:1px solid var(--line);border-radius:6px;min-width:0;width:100%}textarea{height:92px;resize:vertical}.copy{font-size:12px;align-self:stretch;background:#eeeee8;color:var(--ink)}.copy:hover{background:#dfdfd7}code{font:13px ui-monospace,SFMono-Regular,monospace;background:#eeeee8;border-radius:4px;padding:3px 5px}ol{list-style:none;counter-reset:step;padding:0;margin:30px 0 0}li{counter-increment:step;position:relative;padding:0 0 25px 38px}li:before{content:counter(step);position:absolute;left:0;top:1px;background:#eeeee8;border-radius:50%;width:24px;height:24px;text-align:center;line-height:24px;font-size:12px}li strong{font-weight:600;display:block}li p{font-size:14px;color:var(--muted);margin:5px 0 0}details{border-top:1px solid var(--line);padding:20px 0;font-size:13px;color:var(--muted)}summary{cursor:pointer;color:var(--ink);font-weight:550}details p{margin:12px 0 0}footer{font-size:12px;color:var(--muted);margin-top:25px}.error{color:#b23628;font-size:13px;margin-top:12px}#expires{font-size:12px;color:var(--muted);margin:8px 0 0}button:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid var(--accent);outline-offset:4px}[hidden]{display:none!important}@media(max-width:560px){main{padding:28px 20px}nav{margin-bottom:48px}.panel{padding:20px}.panel-top{align-items:flex-start}.field{gap:5px}.copy{padding:8px}.lead{font-size:16px}}
</style></head><body><main>
<nav><div class="brand">MCP<span>Jam</span></div><a href="https://github.com/MCPJam/mcp-events-demo">View source ↗</a></nav>
<div class="eyebrow">Official TypeScript SDK · Events beta</div>
<h1>Your first MCP event.<br>In a few clicks.</h1>
<p class="lead">Connect a real event publisher to MCPJam. Subscribe, send a message, and watch it arrive.</p>
<div class="pills"><span class="pill">Webhook</span><span class="pill">Polling</span><span class="pill">Streaming</span></div>
<section class="panel" aria-labelledby="session-heading"><div class="panel-top"><div><h2 id="session-heading">Start a demo session</h2><p class="muted">Your own event stream. No account needed. Expires in 30 minutes.</p></div><button id="create">Create session</button></div>
<p id="error" class="error" role="alert" hidden></p>
<div id="connection" class="connection" hidden>
<label for="url">1 · Server URL — add an HTTP server in MCPJam</label><div class="field"><input id="url" readonly><button class="copy" data-copy="url">Copy URL</button></div>
<label for="token">2 · Custom header name: Authorization</label><div class="field"><textarea id="token" readonly spellcheck="false" aria-label="Authorization header value"></textarea><button class="copy" data-copy="token">Copy value</button></div>
<p class="muted">Paste the value exactly, including “Bearer”. Choose a custom header, not OAuth.</p><p id="expires"></p>
<p class="muted">Jensen show: open the <a href="/jensen">control room</a> to set his GTA 6 time.</p>
</div></section>
<ol><li><strong>Subscribe to a heartbeat</strong><p>Open Events, choose <code>timer.tick</code>, and subscribe. A new event arrives about every 10 seconds.</p></li><li><strong>Send your own event</strong><p>Subscribe to <code>demo.ping</code>. Then open Tools and call <code>emit_ping</code> with a message. You can ask an agent to call it, too.</p></li><li><strong>Try another delivery mode</strong><p>Compare webhook, polling, and streaming. Enable the mode in your MCPJam client’s Events settings.</p></li></ol>
<details><summary>What happens to my session?</summary><p>Each session is isolated from other visitors. Anyone holding its token can access it, so keep the token to yourself and use test messages only. After 30 minutes, subscriptions stop and stored session data is removed. Create another session to keep testing.</p></details>
<details><summary>Which Events implementation is this?</summary><p>This server uses the official TypeScript SDK’s experimental Events implementation from <a href="https://github.com/modelcontextprotocol/typescript-sdk/pull/3209">PR #3209</a>, pinned to commit <code>5ebb589</code>. It speaks MCP 2026-07-28 with the Events beta extension. It is a demo, not a stable SDK release.</p><p>Webhook subscriptions use Durable Object storage. The event replay buffer is in memory and may reset during a deployment or runtime restart. Your client should reconnect and resubscribe when necessary.</p></details>
<footer>Hosted on Cloudflare · Built for exploring MCP Events</footer>
<p id="status" role="status" aria-live="polite" class="muted"></p>
</main><script>
const byId=id=>document.getElementById(id);let current;
function render(session){current=session;byId('url').value=session.url;byId('token').value='Bearer '+session.token;byId('expires').textContent='Expires '+new Date(session.expiresAt).toLocaleTimeString()+'. Keep this token private.';byId('connection').hidden=false;byId('create').textContent='New session';}
try{const saved=JSON.parse(sessionStorage.getItem('mcp-events-demo'));if(saved&&saved.expiresAt>Date.now())render(saved);}catch{}
byId('create').onclick=async()=>{const button=byId('create');button.disabled=true;byId('error').hidden=true;try{const response=await fetch('/sessions',{method:'POST'});if(!response.ok)throw new Error(await response.text());const session=await response.json();try{sessionStorage.setItem('mcp-events-demo',JSON.stringify(session));}catch{}render(session);}catch(error){byId('error').textContent=error.message;byId('error').hidden=false;}finally{button.disabled=false;}};
document.querySelectorAll('[data-copy]').forEach(button=>button.onclick=async()=>{try{await navigator.clipboard.writeText(byId(button.dataset.copy).value);byId('status').textContent='Copied to clipboard.';}catch{byId(button.dataset.copy).select();byId('status').textContent='Select and copy the highlighted value.';}});
</script></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
