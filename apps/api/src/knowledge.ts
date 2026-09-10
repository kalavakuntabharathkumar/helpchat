export type Knowledge = { title: string; content: string; keywords: string[] };

export const knowledge: Knowledge[] = [
  { title:"Refund policy", content:"Eligible refunds are normally processed within 5–7 business days after approval. Digital items may have different eligibility rules.", keywords:["refund","money","return","charge"] },
  { title:"Order cancellation", content:"Customers can request cancellation while an order is still pending. Once fulfillment starts, cancellation may require staff review.", keywords:["cancel","order","pending"] },
  { title:"Account access", content:"Customers can reset passwords using the account recovery flow. Support should never request or store a customer's password.", keywords:["password","login","account","access"] },
  { title:"Shipping", content:"Standard delivery estimates are shown at checkout. Delays should be checked against the order status before promising a new delivery date.", keywords:["shipping","delivery","delay","tracking"] },
  { title:"Payment troubleshooting", content:"If a payment appears pending, verify the order's payment status before asking the customer to retry. Duplicate charges should be escalated for review.", keywords:["payment","charge","duplicate","pending"] },
  { title:"Technical support", content:"For technical issues, collect the browser/device, approximate time, steps to reproduce, and visible error message. Never request secrets or API keys.", keywords:["error","bug","technical","browser","device"] }
];

export function retrieveContext(question: string, topK = 3) {
  const q = question.toLowerCase();
  return knowledge
    .map(k => ({ ...k, score: k.keywords.reduce((s, word) => s + (q.includes(word) ? 1 : 0), 0) }))
    .sort((a,b)=>b.score-a.score)
    .filter(x=>x.score>0)
    .slice(0,topK);
}
