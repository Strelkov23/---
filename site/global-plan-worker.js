/* Dedicated worker so a large LP does not freeze the research interface. */
importScripts('resource-plan.js','dynamic-plan.js','global-plan.js');
self.onmessage=e=>{
 try{const {m,p,objective,sensitivity,joint,bottleneck}=e.data;if(bottleneck){self.postMessage({result:GlobalPlan.bottleneck(m,p,objective,bottleneck.step,(done,total)=>self.postMessage({progress:{done,total}}))})}else if(joint){const {keyA,keyB,stepA,stepB,mode,originalPlan}=joint;self.postMessage({result:GlobalPlan.jointSensitivity(m,p,objective,keyA,stepA,keyB,stepB,mode,(done,total)=>self.postMessage({progress:{done,total}}),originalPlan)})}else if(sensitivity){const {key,step,mode}=sensitivity;self.postMessage({result:GlobalPlan.sensitivity(m,p,objective,key,step,mode,(done,total)=>self.postMessage({progress:{done,total}}))})}else self.postMessage({result:GlobalPlan.solve(m,p,objective)})}
 catch(err){self.postMessage({error:String(err.message||err)})}
};
