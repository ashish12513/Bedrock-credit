# 🔧 BEDROCK COST GOVERNANCE - INTEGRATION GUIDE

**Status**: Ready to integrate into your application  
**Proxy Endpoint**: `https://3s209lidec.execute-api.us-east-1.amazonaws.com/prod/bedrock-invoke`  
**Timeline**: 30-60 minutes to integrate  
**Expected Result**: 30-40% cost reduction within 30 days

---

## 📋 WHAT TO INTEGRATE

You have two client library options:

### Option 1: Python Application
**File**: `bedrock-production-client.py`
- Use this if your app is Python-based
- Drop-in replacement for boto3 Bedrock client
- Includes error handling, monitoring, and cost tracking

### Option 2: Node.js / TypeScript Application  
**File**: `INTEGRATION-EXAMPLE.js`
- Use this if your app is JavaScript/Node.js/Next.js based
- Class-based implementation for JavaScript
- Works with Next.js API routes and React components

### Option 3: API Gateway Integration
**Endpoint**: `https://3s209lidec.execute-api.us-east-1.amazonaws.com/prod/bedrock-invoke`
- Use this if you want to call the proxy directly via HTTP
- Works with any language/framework
- POST endpoint with JSON payload

---

## 🐍 PYTHON INTEGRATION

### Step 1: Copy the Client

```bash
# Copy to your application
cp /Users/ashishanand/Desktop/Bedrock-credit/bedrock-production-client.py \
   /path/to/your/app/src/

# Or into your project root
cp /Users/ashishanand/Desktop/Bedrock-credit/bedrock-production-client.py \
   ./bedrock_client.py
```

### Step 2: Update Your Code

**Before (boto3):**
```python
import boto3
import json

client = boto3.client('bedrock-runtime', region_name='us-east-1')

response = client.invoke_model(
    modelId='anthropic.claude-3-5-sonnet-20241022-v2:0',
    body=json.dumps({
        'anthropic_version': 'bedrock-2023-06-01',
        'max_tokens': 1024,
        'messages': [{'role': 'user', 'content': 'Hello'}]
    })
)
result = json.loads(response['body'].read())
```

**After (With Governance):**
```python
from bedrock_production_client import BedrockProductionClient

client = BedrockProductionClient(account_id="production-main")

response = client.invoke_model(
    model_id='anthropic.claude-3-5-sonnet-20241022-v2:0',
    messages=[{'role': 'user', 'content': 'Hello'}],
    task_type='default',
    quality='balanced',
    max_tokens=1024
)
```

### Step 3: Add Task Type Hints

The client performs best optimization when you tell it what task you're doing:

```python
# Classification - uses cheapest model (Haiku)
response = client.invoke_model(
    model_id='your-model',
    messages=[...],
    task_type='classification',  # Key optimization point
    quality='cheap'
)

# Summarization - uses mid-tier model (Sonnet)
response = client.invoke_model(
    model_id='your-model',
    messages=[...],
    task_type='summarization',
    quality='balanced'
)

# Complex reasoning - uses best model (Opus)
response = client.invoke_model(
    model_id='your-model',
    messages=[...],
    task_type='reasoning',
    quality='premium'
)
```

### Step 4: Add Error Handling

```python
try:
    response = client.invoke_model(
        model_id='anthropic.claude-3-5-sonnet-20241022-v2:0',
        messages=[{'role': 'user', 'content': 'Hello'}],
        task_type='default',
        quality='balanced'
    )
except Exception as e:
    if '429' in str(e):  # Cost limit exceeded
        logger.warning("Cost limit reached, falling back...")
        response = client._fallback_to_cheap_model(
            messages=[{'role': 'user', 'content': 'Hello'}],
            task_type='default',
            max_tokens=1024
        )
    else:
        raise
```

### Step 5: Add Monitoring (Optional)

```python
# Get current stats
stats = client.get_stats()
print(f"Total requests: {stats['total_requests']}")
print(f"Total cost: ${stats['total_cost']:.2f}")

# Get spending status
spending = client.get_spending_status()
print(f"Today's spend: {spending}")

# Get recommendations
recommendations = client.get_recommendations()
for rec in recommendations[:3]:
    print(f"Recommendation: {rec}")
```

---

## 💻 NODE.JS / JAVASCRIPT INTEGRATION

### Step 1: Add to Your Project

```bash
# Copy to your project
cp /Users/ashishanand/Desktop/Bedrock-credit/INTEGRATION-EXAMPLE.js \
   /path/to/your/app/src/lib/bedrockCostClient.js
```

### Step 2: Import in Your Code

```javascript
// ES modules
import { BedrockCostClient } from './lib/bedrockCostClient.js';

// CommonJS
const { BedrockCostClient } = require('./lib/bedrockCostClient.js');
```

### Step 3: Initialize Client

```javascript
const client = new BedrockCostClient(
  "production-main",
  "https://3s209lidec.execute-api.us-east-1.amazonaws.com/prod"
);
```

### Step 4: Use in Your Code

```javascript
// Simple invocation
const response = await client.invokeModel({
  modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
  messages: [{ role: 'user', content: 'Hello' }],
  taskType: 'default',
  quality: 'balanced',
  maxTokens: 1024
});

console.log(`Cost: $${response.cost_info.estimated_cost.toFixed(4)}`);
```

### Step 5: Use in Next.js API Routes

```typescript
// pages/api/bedrock/invoke.ts
import { BedrockCostClient } from '@/lib/bedrockCostClient';
import { NextRequest, NextResponse } from 'next/server';

export const config = { runtime: 'nodejs' };

export default async function handler(req: NextRequest) {
  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const { text, taskType = 'default' } = await req.json();

  try {
    const client = new BedrockCostClient('production-main');

    const response = await client.invokeModel({
      modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      messages: [{ role: 'user', content: text }],
      taskType,
      quality: 'balanced',
      maxTokens: 1024
    });

    return NextResponse.json({
      success: true,
      result: response,
      cost: response.cost_info.estimated_cost
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
```

### Step 6: Use in React Components

```typescript
// components/BedrockAnalyzer.tsx
import { useState } from 'react';

export function BedrockAnalyzer() {
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [cost, setCost] = useState(0);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/bedrock/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text,
          taskType: 'default'
        })
      });

      const data = await response.json();
      setResult(data.result);
      setCost(data.cost);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} />
      <button onClick={analyze} disabled={loading}>
        {loading ? 'Analyzing...' : 'Analyze'}
      </button>
      {result && (
        <div>
          <p>{result}</p>
          <p>Cost: ${cost.toFixed(4)}</p>
        </div>
      )}
    </div>
  );
}
```

---

## 🌐 DIRECT API INTEGRATION (Any Language)

### Using cURL

```bash
curl -X POST https://3s209lidec.execute-api.us-east-1.amazonaws.com/prod/bedrock-invoke \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "messages": [{"role": "user", "content": "Hello"}],
    "accountId": "production-main",
    "taskType": "default",
    "maxTokens": 1024
  }'
```

### Using Python requests

```python
import requests
import json

url = "https://3s209lidec.execute-api.us-east-1.amazonaws.com/prod/bedrock-invoke"

payload = {
    "modelId": "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "messages": [{"role": "user", "content": "Hello"}],
    "accountId": "production-main",
    "taskType": "default",
    "maxTokens": 1024
}

response = requests.post(url, json=payload)
result = response.json()
print(f"Cost: ${result['cost_info']['estimated_cost']:.4f}")
```

### Using JavaScript fetch

```javascript
const response = await fetch(
  'https://3s209lidec.execute-api.us-east-1.amazonaws.com/prod/bedrock-invoke',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      messages: [{ role: 'user', content: 'Hello' }],
      accountId: 'production-main',
      taskType: 'default',
      maxTokens: 1024
    })
  }
);

const result = await response.json();
console.log(`Cost: $${result.cost_info.estimated_cost.toFixed(4)}`);
```

---

## 📊 PAYLOAD FORMAT

### Request Payload

```json
{
  "modelId": "anthropic.claude-3-5-sonnet-20241022-v2:0",
  "messages": [
    {"role": "user", "content": "Hello world"}
  ],
  "accountId": "production-main",
  "taskType": "default",
  "qualityLevel": "balanced",
  "inputTokens": 2,
  "maxTokens": 1024,
  "enableCaching": true
}
```

### Response Payload

```json
{
  "model": "anthropic.claude-3-5-sonnet-20241022-v2:0",
  "result": {
    "id": "msg_...",
    "type": "message",
    "role": "assistant",
    "content": [{"type": "text", "text": "..."}],
    "model": "...",
    "stop_reason": "end_turn",
    "stop_sequence": null,
    "usage": {"input_tokens": 10, "output_tokens": 50}
  },
  "optimizations_applied": [
    "model_substitution",
    "prompt_caching"
  ],
  "cost_info": {
    "input_tokens": 10,
    "output_tokens": 50,
    "estimated_cost": 0.00045
  }
}
```

---

## ✅ INTEGRATION CHECKLIST

### Before Integration
- [ ] Read this guide completely
- [ ] Choose your integration method (Python/JS/API)
- [ ] Locate all Bedrock API calls in your codebase
- [ ] Backup current code (git commit recommended)

### During Integration
- [ ] Copy client library to your project
- [ ] Update imports (replace boto3 / old client)
- [ ] Update Bedrock calls (add task_type, quality parameters)
- [ ] Add error handling for cost limits (optional but recommended)
- [ ] Test locally with sample data

### Deployment
- [ ] Build/package application
- [ ] Deploy to production (your preferred method)
- [ ] Monitor first hour of logs

### Verification
- [ ] Check `/aws/lambda/bedrock-proxy` logs for errors
- [ ] Verify API endpoint responding 200
- [ ] Confirm costs appearing in dashboard
- [ ] Monitor system latency (should add <50ms)

### Post-Deployment (Day 1-2)
- [ ] Check daily spending
- [ ] Review error rate (should be <0.1%)
- [ ] Get optimization recommendations
- [ ] Implement top 3 recommendations

---

## 🎯 COMMON TASK CONFIGURATIONS

### Classification (Lowest Cost)
```python
# Use cheapest model for classification - 80% cheaper!
response = client.invoke_model(
    model_id='anthropic.claude-3-5-sonnet-20241022-v2:0',  # Will auto-substitute Haiku
    messages=[{'role': 'user', 'content': f'Classify: {text}'}],
    task_type='classification',  # KEY - tells proxy to use cheapest model
    quality='cheap',
    max_tokens=50
)
```

### Summarization (Medium Cost)
```python
# Balanced cost and quality for summarization
response = client.invoke_model(
    model_id='anthropic.claude-3-5-sonnet-20241022-v2:0',
    messages=[{'role': 'user', 'content': f'Summarize: {text}'}],
    task_type='summarization',
    quality='balanced',
    max_tokens=500
)
```

### Complex Reasoning (Higher Cost)
```python
# Use best model for complex reasoning
response = client.invoke_model(
    model_id='anthropic.claude-3-opus-20250219-v1:0',
    messages=[{'role': 'user', 'content': 'Analyze: ...'}],
    task_type='reasoning',
    quality='premium',
    max_tokens=2000
)
```

---

## 📈 EXPECTED RESULTS

### Week 1
- Model substitution working (50-80% savings on classification/summarization)
- First guardrails active (blocking over-limit requests)
- Estimated cost reduction: **15-25%**

### Week 2
- Prompt caching activated (90% savings on repeated prompts)
- Batch processing for non-urgent work (50% savings)
- Estimated cost reduction: **25-35%**

### Week 3-4
- All optimizations active
- Recommendations implemented
- Estimated cost reduction: **30-40%**

### Monthly Savings Example
```
Current Bedrock Spend:      $4,500/month
After Governance (Week 4):  $2,700-3,150/month
─────────────────────────────────────────
Monthly Savings:            $1,350-1,800 (30-40%)
Annual Savings:             $16,200-21,600
```

---

## 🆘 TROUBLESHOOTING

### "Connection refused" or "Timeout"
```bash
# Verify endpoint is reachable
curl -I https://3s209lidec.execute-api.us-east-1.amazonaws.com/prod/bedrock-invoke

# Should return 400 (bad request) not connection error
```

### "429 - Cost Limit Exceeded"
```
This means the account/model has hit daily limit.
The client automatically falls back to cheaper model.
Check spending dashboard to see current usage.
```

### "500 - Internal Server Error"
```bash
# Check Lambda logs
aws logs tail /aws/lambda/bedrock-proxy --follow

# Common issues:
# - IAM permissions missing (bedrock:InvokeModel)
# - DynamoDB table doesn't exist
# - SNS topic ARN invalid
# Fix: Run deployment script again
```

### High Latency (> 100ms added)
```
This is usually Lambda cold starts.
- Wait a few minutes for function to warm up
- Or enable provisioned concurrency:
  aws lambda put-provisioned-concurrency-config \
    --function-name bedrock-proxy \
    --provisioned-concurrent-executions 10
```

---

## 📞 SUPPORT

**Questions?** Email: ashish.anand@redingtongroup.com

**Monitor Logs:**
```bash
aws logs tail /aws/lambda/bedrock-proxy --follow --region us-east-1
```

**Check Status:**
```bash
# Verify Lambda is active
aws lambda get-function-configuration --function-name bedrock-proxy

# Check DynamoDB
aws dynamodb describe-table --table-name bedrock-spending-limits

# Check EventBridge rules
aws events list-rules --query 'Rules[?contains(Name, `bedrock`)]'
```

---

## 🚀 NEXT STEPS

1. **Choose your integration method** (Python/JS/API)
2. **Read the specific example** for your choice:
   - Python: `bedrock-production-client.py`
   - JavaScript: `INTEGRATION-EXAMPLE.js`
3. **Copy client to your project**
4. **Update your Bedrock calls**
5. **Deploy to production**
6. **Monitor logs for first hour**
7. **Track savings in first week**

---

**Status**: Ready to integrate  
**Timeline**: 30-60 minutes integration time  
**Expected Savings**: 30-40% within 30 days  

Start now! 🚀
