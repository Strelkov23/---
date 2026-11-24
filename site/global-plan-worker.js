/* Dedicated worker so a large LP does not freeze the research interface. */
importScripts('resource-plan.js','dynamic-plan.js','global-plan.js');
self.onmessage=e=>{
 try{const {m,p,objective}=e.data;self.postMessage({result:GlobalPlan.solve(m,p,objective)})}
 catch(err){self.postMessage({error:String(err.message||err)})}
};
