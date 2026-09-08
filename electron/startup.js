const state=document.getElementById('state');
async function check(){try{const r=await window.coach.invoke('account');state.textContent=JSON.stringify(r,null,2)}catch(e){state.textContent=e.message}}
document.getElementById('check').onclick=check;
document.getElementById('login').onclick=async()=>{try{await window.coach.invoke('login');state.textContent='已打开官方登录页面，请在浏览器完成 ChatGPT 账户授权。'}catch(e){state.textContent=e.message}};
window.coach.onEvent(e=>{if(e.type==='accountChanged')check()});check();
