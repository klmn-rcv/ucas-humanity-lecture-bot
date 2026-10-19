import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAutomation } from "../src/workflow.js";
import { loadConfig } from "../src/config.js";
import { Logger } from "../src/log.js";

const beijing = (timestamp:number) => new Date(timestamp+8*3600000).toISOString().slice(0,19).replace("T"," ");

describe("reservation watcher against a local website", () => {
  it("books open items immediately, scans both pages, waits for all simultaneous openings and stops at quota", async () => {
    const opens = Math.ceil(Date.now()/1000)*1000+6000;
    const signed = new Set<string>();
    const attempts: Array<{id:string;at:number}> = [];
    const directory = await mkdtemp(join(tmpdir(),"ucas-watch-"));
    const server = createServer(async (request,response) => {
      const chunks=[]; for await (const chunk of request) chunks.push(chunk);
      const params=new URLSearchParams(Buffer.concat(chunks).toString());
      if(request.url === "/subject/toSign") {
        const id=params.get("lectureId")!;
        attempts.push({id,at:Date.now()});
        if(id!=="1" && Date.now()<opens) {response.end("reserveTimeFail");return;}
        signed.add(id);response.end(JSON.stringify("success"));return;
      }
      response.setHeader("Content-Type","text/html; charset=utf-8");
      const quota=`当前已预约次数：${signed.size}/3`;
      if(request.url === "/subject/humanityStudent") {response.end(`<body>${quota}</body>`);return;}
      const number=Number(params.get("page")??1);
      const ids=number===1?["1","2"]:["3"];
      const rows=ids.map(id=>{
        const status=signed.has(id)?"已报名":id==="1"||Date.now()>=opens?
          `<a href="#" onclick="sign('${id}')">报名</a>`:
          `预约时间：${beijing(opens)}~${beijing(opens+86400000)}`;
        return `<tr><td>明德讲堂</td><td>讲座${id}</td><td>2</td><td>教三楼</td><td>${beijing(opens+2*86400000)}</td><td>学生</td><td></td><td>部门</td><td><a href="/subject/${id}/humanityView">查看详情</a>${status}</td></tr>`;
      }).join("");
      response.end(`<body>${quota}<table><tr><th>表头</th></tr>${rows}</table>
        <form method="post"><input id="___num" name="page" value="${number}"></form>
        <div class="pagination"><div class="bn-info">共3项, 当前页${number}/2</div></div>
        <script>function gotoPage(n){document.getElementById('___num').value=n;document.forms[0].submit()}
        function sign(id){fetch('/subject/toSign',{method:'POST',body:new URLSearchParams({lectureId:id})}).then(r=>r.text()).then(r=>{alert(r==='success'?'报名成功！':r);location.reload()})}</script></body>`);
    });
    await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
    const address=server.address() as {port:number};
    const config=loadConfig([]);
    config.loginUrl=config.humanityLectureUrl=`http://127.0.0.1:${address.port}/subject/humanityLecture`;
    config.runMode="scheduled";config.dryRun=false;config.headless=true;
    config.statePath=join(directory,"state.json");
    config.schedule.runImmediatelyOnStart=true;
    config.timeWindows=Array.from({length:7},(_,weekday)=>({weekday,ranges:[{startMinutes:0,endMinutes:1439}]}));
    try {
      const summary=await runAutomation(config,new Logger("error"));
      expect(attempts.map(a=>a.id)).toEqual(["1","2","3"]);
      expect(attempts[0].at).toBeLessThan(opens);
      expect(attempts[1].at).toBeGreaterThanOrEqual(opens);
      expect(attempts[1].at-opens).toBeLessThan(4000);
      expect(summary.attempts.every(a=>a.outcome==="registered")).toBe(true);
      expect(summary.quota.bookedCount).toBe(3);
      expect(summary.stopReason).toContain("次数要求");
    } finally {
      server.closeAllConnections();server.close();
      await rm(directory,{recursive:true,force:true});
    }
  },30000);
});
