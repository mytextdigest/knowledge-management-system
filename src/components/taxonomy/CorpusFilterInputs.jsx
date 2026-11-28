"use client";
export default function CorpusFilterInputs({value,onChange,extended=false}) {
 const fields=[['sourceProvider','Source system'],['ownerId','Owner ID'],...(extended?[['departmentId','Department ID'],['fileType','File type (pdf, doc, slides, text, spreadsheet, recording, image, asset)'],['lifecycle','Lifecycle'],['dateFrom','From date'],['dateTo','To date']]:[])];
 return <div className="flex flex-wrap gap-3">{fields.map(([key,label])=><label key={key} className="text-sm">{label}<input className="block border rounded p-1" type={key.startsWith('date')?'date':'text'} value={value[key]||''} onChange={e=>onChange({...value,[key]:e.target.value})}/></label>)}</div>;
}
