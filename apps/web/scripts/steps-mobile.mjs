// 390x844 layout check, DOM reads only: where the h1 and the first code block sit, and whether the page scrolls sideways.
const ORIGIN = process.env.ORIGIN ?? "http://satchel.localhost:5190";
const METRICS = `(()=>{const y=e=>e?Math.round(e.getBoundingClientRect().top+scrollY):null;const h=document.querySelector('h1');const c=document.querySelector('.codeblock');const t=document.querySelector('.sidebar-toggle');const d=document.documentElement;return 'path='+location.pathname+' viewport='+innerWidth+'x'+innerHeight+' h1.y='+y(h)+' h1="'+(h?.innerText??'')+'" firstCode.y='+y(c)+' firstCodeInViewport='+(c?y(c)<innerHeight:'n/a')+' h1InViewport='+(h?y(h)<innerHeight:false)+' toggle='+(t&&getComputedStyle(t).display!=='none'?'shown':'none')+' scrollWidth='+d.scrollWidth+' clientWidth='+d.clientWidth+' overflowX='+(d.scrollWidth>d.clientWidth)})()`;
const routes = ["/", "/docs/", "/reference/api/", "/proof/", "/concepts/grants-and-epochs/", "/guides/two-apps/", "/reference/errors/", "/pip/", "/fern/"];
const steps = [];
for (const r of routes) {
  steps.push({ navigate: `${ORIGIN}${r}`, fresh: true });
  steps.push({ eval: METRICS, label: `metrics ${r}` });
  steps.push({ assert: `document.documentElement.scrollWidth <= document.documentElement.clientWidth`, label: `no horizontal overflow on ${r}` });
}
steps.push({ navigate: `${ORIGIN}/`, fresh: true });
steps.push({ assert: `getComputedStyle(document.querySelector('.sidebar-groups')).display === 'none'`, label: "docs menu is collapsed until opened" });
steps.push({ click_sel: ".sidebar-toggle" });
steps.push({ assert: `getComputedStyle(document.querySelector('.sidebar-groups')).display !== 'none' && document.querySelector('.sidebar-toggle').getAttribute('aria-expanded') === 'true'`, label: "toggle opens the menu" });
steps.push({ eval: `'MENU open lists ' + [...document.querySelectorAll('.sidebar-groups a')].map(a=>a.innerText).join(' | ')`, label: "menu entries" });
steps.push({ click_sel: `.sidebar-groups a[href="/reference/api/"]` });
steps.push({ poll: `location.pathname === '/reference/api/' && getComputedStyle(document.querySelector('.sidebar-groups')).display === 'none'`, label: "choosing a page closes the menu" });
export default steps;
