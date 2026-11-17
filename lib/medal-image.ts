// The award is rendered locally: student details are never sent to an image service.
export async function createMedalImage(student:{name:string;grade:string;classroom:string},school:string,from:string,to:string,english=false):Promise<Blob>{
 const font=new FontFace('MedalNaskh','url(/fonts/arabic.ttf)');await font.load();document.fonts.add(font);
 const c=document.createElement('canvas');c.width=1200;c.height=1500;const g=c.getContext('2d');if(!g)throw new Error('image');
 g.fillStyle='#f5faf7';g.fillRect(0,0,1200,1500);g.strokeStyle='#c9a351';g.lineWidth=5;g.strokeRect(35,35,1130,1430);g.strokeStyle='#cbded5';g.lineWidth=2;g.strokeRect(52,52,1096,1396);
 g.fillStyle='#145b4c';g.fillRect(65,65,1070,145);g.textAlign='center';g.direction='rtl';
 const text=(value:string,y:number,size:number,color='#174d40',max=1000)=>{g.fillStyle=color;g.font=size+'px MedalNaskh';while(g.measureText(value).width>max&&size>20)g.font=(--size)+'px MedalNaskh';g.fillText(value,600,y);};
 text(school||'خطوة',155,42,'#ffffff');
 // Vector medal with ribbons and a gold rosette.
 g.fillStyle='#207864';g.beginPath();g.moveTo(490,465);g.lineTo(445,705);g.lineTo(520,660);g.lineTo(575,720);g.lineTo(610,480);g.fill();g.beginPath();g.moveTo(590,480);g.lineTo(625,720);g.lineTo(680,660);g.lineTo(755,705);g.lineTo(710,465);g.fill();
 const gold=g.createRadialGradient(545,355,15,600,440,175);gold.addColorStop(0,'#fff1b9');gold.addColorStop(.55,'#e8c56e');gold.addColorStop(1,'#a77924');g.fillStyle=gold;g.beginPath();for(let i=0;i<80;i++){const a=i*Math.PI/40,r=i%2?155:170,x=600+Math.cos(a)*r,y=435+Math.sin(a)*r;i?g.lineTo(x,y):g.moveTo(x,y);}g.closePath();g.fill();g.strokeStyle='#fff0b8';g.lineWidth=4;g.beginPath();g.arc(600,435,137,0,Math.PI*2);g.stroke();
 text('★',420,66,'#795519');text(english?'EXCELLENCE':'تميّز',490,48,'#795519');
 text(english?'Attendance & Conduct Medal':'وسام الحضور والانضباط',815,62);text(english?'Awarded with appreciation to':'يُمنح بكل تقدير للطالب',895,36,'#61776e');text(student.name,990,65);text(student.grade+' / '+student.classroom,1050,36,'#61776e');
 text(english?'For attendance and positive school conduct':'تقديرًا لمواظبته على الحضور والتزامه السلوكي',1140,36);text(from+'  —  '+to,1210,32);text(english?'Keep shining. We are proud of you!':'نعتز بك… ونتطلع إلى استمرار تميّزك',1310,39);text(english?'Khotwa • Student Affairs':'خطوة • شؤون الطلاب',1400,29,'#61776e');
 return await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('image')),'image/png'));
}
