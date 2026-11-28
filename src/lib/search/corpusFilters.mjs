export function corpusFilters(input={}) {
 const filters=[];
 for(const key of ['sourceProvider','ownerId','lifecycle','category']) if(typeof input[key]==='string'&&input[key]) filters.push({[key]:input[key]});
 const extensions={pdf:['.pdf'],spreadsheet:['.xlsx','.xls','.csv'],doc:['.docx','.doc'],text:['.txt','.md'],slides:['.pptx'],recording:['.mp4','.mov','.mp3','.m4a','.wav'],image:['.png','.jpg','.jpeg']};
 if(input.fileType==='asset')filters.push({contentType:'asset'});
 else if(extensions[input.fileType])filters.push({OR:extensions[input.fileType].map(ext=>({filename:{endsWith:ext,mode:'insensitive'}}))});
 const range={};for(const [key,op] of [['dateFrom','gte'],['dateTo','lte']])if(typeof input[key]==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(input[key])){const d=new Date(input[key]);if(Number.isFinite(+d)){if(op==='lte')d.setUTCHours(23,59,59,999);range[op]=d;}}
 if(Object.keys(range).length)filters.push({createdAt:range});
 return filters;
}
