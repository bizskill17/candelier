import {ordersApi,imageUrl} from '../../api/client';
import {downloadCanvasPdf} from '../../lib/canvasPdf';

const PAGE_W=1240,PAGE_H=1754,M=72,BLUE='#2f80c9',NAVY='#15365f',LINE='#b9ddf5',MUTED='#5b6b7d',INK='#17283d';

function roundRect(ctx,x,y,w,h,r,fill,stroke){
 ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
 if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}
}
function wrap(ctx,value,maxWidth){
 const words=String(value??'â').trim().split(/\s+/).filter(Boolean);if(!words.length)return ['â'];
 const lines=[];let line='';for(const word of words){const candidate=line?`${line} ${word}`:word;if(line&&ctx.measureText(candidate).width>maxWidth){lines.push(line);line=word;}else line=candidate;}if(line)lines.push(line);return lines;
}
function drawWave(ctx,y,width,color,offset=0){
 ctx.beginPath();ctx.moveTo(0,y+offset);ctx.bezierCurveTo(width*.24,y+75+offset,width*.34,y-30+offset,width*.56,y+26+offset);ctx.bezierCurveTo(width*.76,y+78+offset,width*.86,y+58+offset,width,y+8+offset);ctx.lineTo(width,y+105);ctx.bezierCurveTo(width*.78,y+155,width*.64,y+76,width*.43,y+125);ctx.bezierCurveTo(width*.23,y+177,width*.13,y+105,0,y+142);ctx.closePath();ctx.fillStyle=color;ctx.fill();
}
function loadPhoto(path){
 if(!path)return Promise.resolve(null);
 return new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=imageUrl(path);});
}
function date(value){return value?String(value).split('-').reverse().join('/'): 'â';}

export async function downloadOrderPdf(id){
 const {data:o}=await ordersApi.get(id);
 const items=await Promise.all((o.items||[]).map(async it=>({...it,pattern:await loadPhoto(it.reference_image),component:await loadPhoto(it.component_image)})));
 const pages=[];let canvas,ctx,y,pageNo=0;
 const finish=()=>pages.push(canvas.toDataURL('image/jpeg',.92).split(',')[1]);
 const start=()=>{
  pageNo++;canvas=document.createElement('canvas');canvas.width=PAGE_W;canvas.height=PAGE_H;ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,PAGE_W,PAGE_H);
  const gradient=ctx.createLinearGradient(0,0,PAGE_W,190);gradient.addColorStop(0,'#ffffff');gradient.addColorStop(.55,'#f0f9ff');gradient.addColorStop(1,'#d9efff');ctx.fillStyle=gradient;ctx.fillRect(0,0,PAGE_W,225);drawWave(ctx,150,PAGE_W,'#d7efff',0);drawWave(ctx,175,PAGE_W,'#edf8ff',0);
  ctx.fillStyle=NAVY;ctx.textAlign='right';ctx.font='bold 38px Arial';ctx.fillText('Order Confirmation',PAGE_W-M,71);ctx.font='22px Arial';ctx.fillStyle='#31577f';ctx.fillText(`Order ${o.order_no||''}`,PAGE_W-M,106);ctx.textAlign='left';
  y=220;
  ctx.strokeStyle=LINE;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(M, PAGE_H-62);ctx.lineTo(PAGE_W-M,PAGE_H-62);ctx.stroke();
  drawWave(ctx,PAGE_H-178,PAGE_W,'#eaf6ff',0);ctx.fillStyle=MUTED;ctx.font='16px Arial';ctx.textAlign='right';ctx.fillText(`Page ${pageNo}`,PAGE_W-M,PAGE_H-35);ctx.textAlign='left';
 };
 const meta=()=>{
  const x=M,w=PAGE_W-2*M,h=166;roundRect(ctx,x,y,w,h,18,'#fbfdff',LINE);
  ctx.fillStyle=NAVY;ctx.font='bold 22px Arial';ctx.fillText('Customer & Order Information',x+26,y+34);
  ctx.strokeStyle='#d7eafa';ctx.beginPath();ctx.moveTo(x+26,y+48);ctx.lineTo(x+w-26,y+48);ctx.stroke();
  const cols=[[
   ['Customer',o.customer_name],['Project',o.project_name],['Shipping Address',o.shipping_address]
  ],[
   ['Order Date',date(o.order_date)],['Delivery Date',date(o.delivery_date)],['Order By',o.order_by_name]
  ]];
  const colW=(w-72)/2;
  cols.forEach((list,c)=>list.forEach((entry,i)=>{
   const fx=x+28+c*(colW+16),fy=y+75+i*35;ctx.font='18px Arial';ctx.fillStyle=NAVY;const label=entry[0]+' -';ctx.fillText(label,fx,fy);const labelW=ctx.measureText(label+' ').width;
   ctx.fillStyle=INK;ctx.font='18px Arial';ctx.fillText(entry[1]||'',fx+labelW,fy);
  }));
  y+=h+16;
 };
 const itemDimensions=it=>{
  const details=[...(it.details||[])];
  const colW=(PAGE_W-2*M-80)/2;let leftH=0,rightH=0;
  details.forEach((d,i)=>{ctx.font='20px Arial';const lines=wrap(ctx,d.value||'â',colW-20).length;const ht=25+Math.max(1,lines)*24+16;if(i%2)rightH+=ht;else leftH+=ht;});
  const detailsH=Math.max(leftH,rightH,54)+30;ctx.font='23px Arial';const remarks=it.remarks?Math.max(64,wrap(ctx,`Remarks - ${it.remarks}`,(PAGE_W-2*M)-88).length*30+30):0;
  return {details,detailsH,remarksH:remarks,imageH:390,total:58+detailsH+remarks+22+390+28};
 };
 const drawItem=(it)=>{
  const dim=itemDimensions(it),x=M,w=PAGE_W-2*M;
  roundRect(ctx,x,y,w,dim.total,16,'#fff',LINE);
  roundRect(ctx,x,y,w,58,16,'#e6f4ff');ctx.fillStyle=NAVY;ctx.font='bold 23px Arial';ctx.fillText(`Item - ${it.item_name||it.line_no||''}`,x+24,y+37);
  if(it.area){ctx.textAlign='right';ctx.fillStyle='#31577f';ctx.font='20px Arial';ctx.fillText(it.area,x+w-24,y+37);ctx.textAlign='left';}
  let fy=y+82;const colW=(w-80)/2;let cy=[fy,fy];
  dim.details.forEach((d,i)=>{
   const c=i%2,fx=x+28+c*(colW+24);ctx.fillStyle=NAVY;ctx.font='19px Arial';const label=`${d.name||'Field'} -`;ctx.fillText(label,fx,cy[c]);const labelW=ctx.measureText(label+' ').width;
   ctx.fillStyle=INK;ctx.font='19px Arial';const lines=wrap(ctx,d.value||'',colW-labelW-10);lines.forEach((line,n)=>ctx.fillText(line,fx+labelW,cy[c]+n*23));cy[c]+=25+Math.max(1,lines.length)*23+12;
  });
  fy=y+58+dim.detailsH;
  if(it.remarks){roundRect(ctx,x+24,fy,w-48,dim.remarksH,10,'#f6fbff','#d8eafa');ctx.fillStyle=NAVY;ctx.font='bold 21px Arial';const label='Remarks -';ctx.fillText(label,x+40,fy+39);ctx.fillStyle=INK;ctx.font='23px Arial';const lines=wrap(ctx,it.remarks,w-160);lines.forEach((line,n)=>ctx.fillText(line,x+40+ctx.measureText(label+' ').width,fy+39+n*30));fy+=dim.remarksH+17;}
  const gap=22,panelW=(w-gap)/2,panelH=390;
  [[it.pattern,'Pattern Image'],[it.component,'Component Image']].forEach(([img,label],index)=>{
   const px=x+index*(panelW+gap);roundRect(ctx,px,fy,panelW,panelH,13,'#fff','#c8e4f7');roundRect(ctx,px,fy,panelW,45,13,'#e8f5ff');ctx.fillStyle=NAVY;ctx.font='bold 18px Arial';ctx.fillText(label,px+18,fy+29);
   const boxX=px+18,boxY=fy+59,boxW=panelW-36,boxH=panelH-77;roundRect(ctx,boxX,boxY,boxW,boxH,9,'#fbfdff','#dcecf7');
   if(img){const scale=Math.min((boxW-18)/img.naturalWidth,(boxH-18)/img.naturalHeight);const iw=img.naturalWidth*scale,ih=img.naturalHeight*scale;ctx.drawImage(img,boxX+(boxW-iw)/2,boxY+(boxH-ih)/2,iw,ih);}
   else{ctx.strokeStyle='#b7c9d9';ctx.lineWidth=3;ctx.beginPath();ctx.rect(boxX+boxW/2-29,boxY+boxH/2-23,58,46);ctx.moveTo(boxX+boxW/2-24,boxY+boxH/2+16);ctx.lineTo(boxX+boxW/2-4,boxY+boxH/2-4);ctx.lineTo(boxX+boxW/2+7,boxY+boxH/2+7);ctx.lineTo(boxX+boxW/2+18,boxY+boxH/2-9);ctx.lineTo(boxX+boxW/2+25,boxY+boxH/2+16);ctx.stroke();}
  });
  y+=dim.total+22;
 };
 start();meta();
 for(const it of items){const dim=itemDimensions(it);if(y+dim.total>PAGE_H-205){finish();start();}drawItem(it);}
 finish();downloadCanvasPdf(pages,PAGE_W,PAGE_H,'Order-'+o.order_no+'.pdf');
}
