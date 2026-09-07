import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
const B = path.join(process.cwd(), ".cache", "pocketbase", "0.40.1", "pocketbase");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pbdbg-"));
const SU = { email: "d@x.test", password: "dbg-pass-12345" };
spawnSync(B, ["superuser","upsert",SU.email,SU.password,`--dir=${dir}`,`--migrationsDir=${dir}/m`], {encoding:"utf8"});
const proc = spawn(B, ["serve","--dev","--http=127.0.0.1:8145",`--dir=${dir}`,`--migrationsDir=${dir}/m`,`--hooksDir=${process.env.HK}`], {stdio:["ignore","pipe","pipe"]});
proc.stdout.on("data",d=>process.stdout.write(`[out] ${d}`));
proc.stderr.on("data",d=>process.stdout.write(`[err] ${d}`));
const U="http://127.0.0.1:8145";
for(let i=0;i<100;i++){try{if((await fetch(U+"/api/health")).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
const { default: PB } = await import("pocketbase");
const pb = new PB(U);
await pb.collection("_superusers").authWithPassword(SU.email, SU.password);
await pb.collections.import(JSON.parse(fs.readFileSync("docs/pb_schema.json","utf8")), true);
const u = await pb.collection("users").create({ email:"d@y.test", password:"pw-12345678", passwordConfirm:"pw-12345678", name:"d" });
const proj = await pb.collection("projects").create({ name:"dbg", owner:u.id });
const sub = await pb.collection("submittals").create({ project:proj.id, submittal_number:"A101-004", description:"d" });
const tpl = await pb.collection("workflow_templates").create({ name:"t", entity_type:"submittal", project:proj.id });
const snap = { template:{id:tpl.id}, steps:[{step_order:1,name:"R",approver_mode:"any_of_users",approver_users:[u.id],on_reject:"return_to_start"}] };
try {
  const inst = await pb.collection("workflow_instances").create({ project:proj.id, submittal:sub.id, template:tpl.id,
    template_snapshot:snap, started_by:u.id, started_at:new Date().toISOString(), status:"pending", current_step_order:1 });
  console.log("CREATED OK", inst.id);
} catch(e) { console.log("CREATE FAILED", e.status, JSON.stringify(e.response)); }
await new Promise(r=>setTimeout(r,600));
proc.kill("SIGTERM"); fs.rmSync(dir,{recursive:true,force:true});
