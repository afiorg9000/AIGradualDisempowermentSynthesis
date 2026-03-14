const AIRTABLE_API_ROOT='https://api.airtable.com/v0';

const AIRTABLE_BASE_ID=process.env.AIRTABLE_BASE_ID||'appGTnev7jl45yAOj';
const AIRTABLE_TABLE_ID=process.env.AIRTABLE_TABLE_ID||'tblHAvcNWQykNsC6f';
const AIRTABLE_API_KEY=process.env.AIRTABLE_API_KEY||'';

const FIELD_TITLE_ID=process.env.AIRTABLE_FIELD_TITLE_ID||'fldqnO7TgwctFfa5a';
const FIELD_BODY_ID=process.env.AIRTABLE_FIELD_BODY_ID||'fldquWR3AfhvbvzVe';
const FIELD_STATUS_ID=process.env.AIRTABLE_FIELD_STATUS_ID||'fldaM6UhwmTxYp9JI';

const STATUS_TODO=process.env.AIRTABLE_STATUS_TODO||'Todo';
const STATUS_DONE=process.env.AIRTABLE_STATUS_DONE||'Done';

const JSON_HEADERS={
  'Content-Type':'application/json',
  'Cache-Control':'no-store'
};

function json(statusCode,payload){
  return{
    statusCode,
    headers:JSON_HEADERS,
    body:JSON.stringify(payload)
  };
}

function ensureConfigured(){
  return Boolean(AIRTABLE_API_KEY&&AIRTABLE_BASE_ID&&AIRTABLE_TABLE_ID);
}

function escapeFormulaValue(value){
  return String(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}

async function airtableFetch(path,init){
  return fetch(`${AIRTABLE_API_ROOT}/${path}`,{
    ...init,
    headers:{
      Authorization:`Bearer ${AIRTABLE_API_KEY}`,
      ...(init?.headers||{})
    }
  });
}

async function getApprovedCount(){
  let count=0;
  let offset='';
  const doneValue=escapeFormulaValue(STATUS_DONE);

  do{
    const params=new URLSearchParams();
    params.set('filterByFormula',`{${FIELD_STATUS_ID}}='${doneValue}'`);
    params.set('pageSize','100');
    if(offset)params.set('offset',offset);

    const res=await airtableFetch(`${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?${params.toString()}`,{method:'GET'});
    if(!res.ok){
      const text=await res.text();
      throw new Error(`Airtable count failed (${res.status}): ${text}`);
    }

    const data=await res.json();
    count+=(data.records||[]).length;
    offset=data.offset||'';
  }while(offset);

  return count;
}

async function submitFinding(body){
  const note=typeof body.note==='string'?body.note.trim():'';
  const name=typeof body.name==='string'&&body.name.trim()?body.name.trim():'Anonymous';
  const email=typeof body.email==='string'?body.email.trim():'';
  if(!note){
    return json(400,{ok:false,error:'Missing note'});
  }

  const payload={
    fields:{
      [FIELD_TITLE_ID]:name||'Anonymous submission',
      [FIELD_BODY_ID]:`Finding: ${note}\n\nContact: ${email||'not provided'}\nDate: ${new Date().toISOString().slice(0,10)}`,
      [FIELD_STATUS_ID]:STATUS_TODO
    }
  };

  const res=await airtableFetch(`${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });

  if(!res.ok){
    const text=await res.text();
    throw new Error(`Airtable submit failed (${res.status}): ${text}`);
  }

  return json(200,{ok:true});
}

export async function handler(event){
  if(event.httpMethod==='OPTIONS'){
    return{statusCode:204,headers:JSON_HEADERS,body:''};
  }

  if(!ensureConfigured()){
    return json(503,{ok:false,error:'Airtable integration not configured'});
  }

  try{
    if(event.httpMethod==='GET'){
      const approvedCount=await getApprovedCount();
      return json(200,{ok:true,approvedCount});
    }

    if(event.httpMethod==='POST'){
      const body=event.body?JSON.parse(event.body):{};
      return await submitFinding(body);
    }

    return json(405,{ok:false,error:'Method not allowed'});
  }catch(error){
    return json(500,{ok:false,error:error?.message||'Unexpected error'});
  }
}
