import {ordersApi,imageUrl} from '../../api/client';
import {downloadCanvasPdf} from '../../lib/canvasPdf';
export async function downloadOrderPdf(id){
 const {data:o}=await ordersApi.get(id);const width=1754,height=1240,pages=[];let canvas,ctx,y;
 const start=()=>{canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#111827';ctx.font='bold 36px Arial';ctx.fillText('Order '+o.order_no,70,85);y=135;};
 const finish=()=>pages.push(canvas.toDataURL('image/jpeg',.9).split(',')[1]);
 const text=(label,value)=>{ctx.font='22px Arial';const words=String(value||'—').split(/\s+/);let line=label?label+': ':'';for(const word of words){if(ctx.measureText(line+' '+word).width>1580){if(y>height-80){finish();start();}ctx.fillText(line,70,y);y+=32;line=word;}else line+=(line?' ':'')+word;}if(y>height-80){finish();start();}ctx.fillText(line,70,y);y+=36;};
 const photo=path=>!path?Promise.resolve(null):new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>resolve(null);i.src=imageUrl(path);});
 start();text('Customer',o.customer_name);text('Project',o.project_name);text('Order Date',o.order_date?.split('-').reverse().join('/'));text('Delivery Date',o.delivery_date?.split('-').reverse().join('/'));text('Order By',o.order_by_name);text('Shipping Address',o.shipping_address);y+=20;
 for(const it of o.items||[]){if(y>650){finish();start();}text('Item #'+it.line_no,it.area);for(const detail of it.details||[])text(detail.name,detail.value);text('Remarks',it.remarks);const pictures=await Promise.all([photo(it.reference_image),photo(it.component_image)]);if(y+285>height-70){finish();start();}pictures.forEach((image,k)=>{ctx.font='bold 20px Arial';ctx.fillText(k?'Component Image':'Pattern Image',70+k*820,y+20);if(image){const scale=Math.min(720/image.naturalWidth,220/image.naturalHeight);ctx.drawImage(image,70+k*820,y+40,image.naturalWidth*scale,image.naturalHeight*scale);}});y+=295;}
 finish();downloadCanvasPdf(pages,width,height,'Order-'+o.order_no+'.pdf');
}
