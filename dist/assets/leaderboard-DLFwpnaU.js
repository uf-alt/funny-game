import{s as o,u as p}from"./supabase-CbrH9no3.js";async function y(){const{data:a,error:t}=await o.from("scores").select("player_id, score, played_at").order("score",{ascending:!1}).limit(20);if(t){p("Failed to load leaderboard: "+t.message,0);return}if(!a||a.length===0){document.getElementById("leaderboard-container").textContent="No scores yet — play a game!";return}const n=[...new Set(a.map(e=>e.player_id))],{data:r}=await o.from("profiles").select("id, username").in("id",n),s={};r?.forEach(e=>{s[e.id]=e.username});const d=document.createElement("table");d.id="leaderboard-table",d.innerHTML=`
    <thead>
      <tr>
        <th>#</th>
        <th>Player</th>
        <th>Score</th>
        <th>Date</th>
      </tr>
    </thead>`;const l=document.createElement("tbody");a.forEach((e,m)=>{const i=document.createElement("tr"),u=new Date(e.played_at).toLocaleDateString(void 0,{year:"numeric",month:"short",day:"numeric"}),h=s[e.player_id]||"Unknown";i.innerHTML=`
      <td class="lb-rank">${m+1}</td>
      <td class="lb-player">${h}</td>
      <td class="lb-score">${e.score.toLocaleString()}</td>
      <td class="lb-date">${u}</td>`,l.appendChild(i)}),d.appendChild(l);const c=document.getElementById("leaderboard-container");c.innerHTML="",c.appendChild(d)}o.auth.onAuthStateChange((a,t)=>{if(!t){window.location.href="index.html";return}const n=document.getElementById("username");n.textContent=t.user.user_metadata?.username||t.user.email,o.from("profiles").select("username").eq("id",t.user.id).single().then(({data:r})=>{r?.username&&(n.textContent=r.username)}),y()});
