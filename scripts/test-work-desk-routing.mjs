import fs from 'node:fs';import assert from 'node:assert/strict';import ts from 'typescript';
const source=ts.createSourceFile('dashboard.tsx',fs.readFileSync('app/dashboard.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const dashboard=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='Dashboard');const fn=dashboard.body.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='openDeskTask');
const code=ts.transpile(fn.getText(source),{target:ts.ScriptTarget.ES2022});
new Function('assert',`let allowed=true,data={},selected=null,outcome='',contact=null,target=null,route=null,editing=null;const c={id:'c',studentId:'s',type:'تأخر',followStatus:'open',outcome:'نتيجة'},s={id:'s',name:'طالب',phone:'0500000000'},cases=[c],sentCaseIds=new Set();const canLeaveAttendance=()=>allowed,student=id=>id==='s'?s:null,setEditing=v=>editing=v,setFollowEdit=v=>selected=v,setOutcome=v=>outcome=v,setContactEdit=v=>contact=v,messageFor=()=> 'مسودة فقط',go=v=>route=v,setDeskTarget=v=>target=v;
${code}
const base={id:'task',recordId:'c',studentId:'s'};
allowed=false;openDeskTask({...base,kind:'follow'});assert.equal(selected,null);allowed=true;
openDeskTask({...base,kind:'follow'});assert.equal(selected,c);assert.equal(outcome,'نتيجة');assert.equal(route,null);
openDeskTask({...base,kind:'case-notify'});assert.equal(contact.c,c);assert.equal(contact.message,'مسودة فقط');contact=null;sentCaseIds.add('c');openDeskTask({...base,kind:'case-notify'});assert.equal(contact,null,'confirmed notifications cannot be opened again from a stale task');
const message={id:'m',revision:3};openDeskTask({...base,kind:'message'},message);assert.equal(route,'messages');assert.equal(target.message,message);
openDeskTask({...base,kind:'thanks'},message);assert.equal(target.message.id,'m');
openDeskTask({...base,recordId:'a',kind:'absence-notify'});assert.equal(route,'attendance');assert.equal(target.attendanceId,'a');
openDeskTask({...base,kind:'absence-follow'});assert.equal(target.followStudentId,'s');
route=null;openDeskTask({...base,kind:'absence-notify',phoneMissing:true});assert.equal(editing.id,'s');assert.equal(route,null,'missing phone opens student review without a message');
`)(assert);
console.log('Work desk routing passed: exact message, case follow-up, notification draft, attendance row and absence follow; missing phone review, saved-sent guard and navigation guard; no WhatsApp send on task click.');
