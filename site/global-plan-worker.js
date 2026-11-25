/* Dedicated worker so a large LP does not freeze the research interface. */
importScripts('resource-plan.js','dynamic-plan.js','global-plan.js');
self.onmessage=e=>{
 try{const {m,p,objective,sensitivity}=e.data;if(sensitivity){const {key,step,mode}=sensitivity;self.postMessage({result:GlobalPlan.sensitivity(m,p,objective,key,step,mode,(done,total)=>self.postMessage({progress:{done,total}}))})}else self.postMessage({result:GlobalPlan.solve(m,p,objective)})}
 catch(err){self.postMessage({error:String(err.message||err)})}
};
