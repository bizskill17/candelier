export function downloadCanvasPdf(pages,width,height,filename){
  const portrait = height > width;
  const pageWidth = portrait ? 595 : 842;
  const pageHeight = portrait ? 842 : 595;
  const enc = new TextEncoder();
  const chunks = [], offsets = [0]; let length = 0;
  const push = (bytes) => { chunks.push(bytes); length += bytes.length; };
  const ascii = (v) => push(enc.encode(v));
  const object = (id, text) => { offsets[id] = length; ascii(id + ' 0 obj\n' + text + '\nendobj\n'); };
  ascii('%PDF-1.4\n');
  const pageIds = pages.map((_,i) => 3 + i * 3);
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [' + pageIds.map(id=> id+' 0 R').join(' ') + '] /Count ' + pages.length + ' >>');
  for (let i=0; i<pages.length; i++) {
    const id = pageIds[i], jpg = Uint8Array.from(atob(pages[i]), c => c.charCodeAt(0));
    object(id, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageWidth + ' ' + pageHeight + '] /Resources << /XObject << /Im0 ' + (id+1) + ' 0 R >> >> /Contents ' + (id+2) + ' 0 R >>');
    offsets[id+1]=length;
    ascii((id+1)+' 0 obj\n<< /Type /XObject /Subtype /Image /Width '+width+' /Height '+height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpg.length+' >>\nstream\n');
    push(jpg); ascii('\nendstream\nendobj\n');
    const stream = 'q ' + pageWidth + ' 0 0 ' + pageHeight + ' 0 0 cm /Im0 Do Q';
    object(id+2, '<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream');
  }
  const xref = length, size=3+pages.length*3;
  ascii('xref\n0 '+size+'\n0000000000 65535 f \n');
  for(let i=1;i<size;i++) ascii(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
  ascii('trailer\n<< /Size '+size+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF');
  const pdf=new Blob(chunks,{type:'application/pdf'});const url=URL.createObjectURL(pdf);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
