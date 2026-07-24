# Production Implementation Checklist

## Phase 1: Setup (Week 1) - Read-Only Mode

### Days 1-2: Deploy Request Proxy

- [ ] Review PRODUCTION-IMPLEMENTATION-GUIDE.md section 1
- [ ] Deploy `bedrock-proxy` Lambda function
- [ ] Test proxy endpoint with sample requests
- [ ] Create API Gateway resource `/bedrock-invoke`
- [ ] Test: `curl -X POST https://...../bedrock-invoke -d '{"modelId":"..."}'`
- [ ] Verify Lambda can call real Bedrock API
- [ ] Grant Lambda Bedrock permissions: `bedrock-runtime:InvokeModel`

**Verification:**
```bash
# Should return 200 with Bedrock response
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"modelId":"anthropic.claude-3-5-sonnet-20241022-v2:0","messages":[{"role":"user","content":"hello"}]}' \
  https://sh0xxez42b.execute-api.us-east-1.amazonaws.com/prod/bedrock-invoke
```

### Days 3-4: Monitor Mode Deployment

- [ ] Deploy proxy Lambda in non-enforcing mode (just logging)
- [ ] Add CloudWatch logging for all requests
- [ ] Create CloudWatch dashboard showing request traffic
- [ ] Set log retention to 7 days
- [ ] Point dev/test environment to proxy (read-only for now)

**Verification:**
```bash
# Check logs
aws logs tail /aws/lambda/bedrock-proxy --follow
```

### Days 5-7: Collect Baseline Data

- [ ] Route all DEV Bedrock calls through proxy for 3 days
- [ ] Collect metrics:
  - [ ] Number of requests per model
  - [ ] Estimated tokens per request
  - [ ] Most common request types
  - [ ] Peak usage times
- [ ] Generate report on current usage patterns
- [ ] Identify models candidates for substitution

**Data Collection Query:**
```bash
aws logs insights query \
  --log-group-name /aws/lambda/bedrock-proxy \
  --start-time 1620000000 \
  --end-time 1620086400 \
  --query-string 'fields @timestamp, modelId, inputTokens | stats sum(inputTokens) by modelId'
```

**Sample Analysis:**
```
Model Usage Baseline (Week 1):
- Claude Sonnet: 85% of requests, avg 200 tokens
- Claude Opus: 10% of requests, avg 500 tokens  
- Claude Haiku: 5% of requests, avg 50 tokens

Estimated Daily Cost: $45
Optimization Potential: $15-20/day (33%)
```

---

## Phase 2: Enforcement (Week 2-3) - Graduated Rollout

### Days 8-9: Set Conservative Limits

- [ ] Set initial model limits at 200% of baseline usage
  ```
  If daily avg = $45, set limit = $90/day per model
  ```
- [ ] Set account limits at 200% of expected capacity
- [ ] Enable guardrails in Lambda (blocking mode)
- [ ] Add retry logic in proxy for 429 responses
- [ ] Test: Manually trigger limit violations

**Configuration:**
```python
# bedrock-guardrails-lambda.py
MODEL_LIMITS = {
    'anthropic.claude-3-5-sonnet-20241022-v2:0': 150,  # 200% of baseline
    'anthropic.claude-3-opus-20250219-v1:0': 100,      # Conservative
    'anthropic.claude-3-haiku-20250307-v1:0': 50,      # Safe threshold
}
```

### Days 10-11: Test in Dev Environment

- [ ] Route DEV environment through guardrails
- [ ] Attempt to exceed limits (negative test)
- [ ] Verify 429 responses received
- [ ] Verify SNS alerts triggered
- [ ] Monitor error rates
- [ ] Ensure fallback mechanisms work

**Test Script:**
```bash
#!/bin/bash
# Trigger limit test
for i in {1..10}; do
  curl -X POST \
    -H "Content-Type: application/json" \
    -d '{"modelId":"anthropic.claude-3-opus-20250219-v1:0","inputTokens":5000}' \
    https://.../bedrock-invoke
done
# Should see: first 1-2 succeed, rest return 429
```

### Days 12-14: Stage Environment Rollout

- [ ] Switch STAGING environment to use guardrails
- [ ] Monitor for 1 week
- [ ] Verify no production impact
- [ ] Review blocked request logs
- [ ] Collect feedback from team
- [ ] Adjust limits if needed

**Monitoring Dashboard:**
```
STAGING Environment Metrics (Week 2):
- Requests processed: 1,247
- Requests blocked: 8 (0.6%)
- Estimated cost saved: $3.20
- User complaints: 0
```

---

## Phase 3: Optimization (Week 3-4) - Enable Recommendations

### Days 15-16: Activate Recommendations Engine

- [ ] Deploy `bedrock-optimizer` Lambda
- [ ] Deploy `bedrock-recommendations-engine` Lambda
- [ ] Deploy `bedrock-dashboard-integration` Lambda
- [ ] Verify EventBridge triggers are running
- [ ] Check DynamoDB tables for recommendations

**Verification:**
```bash
# Check latest recommendations
aws dynamodb scan \
  --table-name bedrock-optimization-recommendations \
  --limit 5
```

### Days 17-18: Implement Top 3 Recommendations

Based on recommendations output, implement:

1. **Model Substitution (if applicable)**
   - [ ] Identify Opus → Sonnet migration opportunities
   - [ ] Update routing logic
   - [ ] Test with sample requests
   - [ ] Monitor accuracy/quality
   - [ ] Expected savings: $50-100/week

2. **Prompt Caching (if using Claude 3.5+)**
   - [ ] Enable cache_control in API calls
   - [ ] Test with repeated prompts
   - [ ] Verify cache hits in logs
   - [ ] Expected savings: $40-80/week

3. **Output Token Reduction**
   - [ ] Reduce max_tokens where appropriate
   - [ ] Test quality metrics
   - [ ] Adjust incrementally
   - [ ] Expected savings: $10-30/week

**Implementation Example:**
```python
# Before
bedrock.invoke_model(modelId=model, body=json.dumps({'max_tokens': 1000}))

# After (optimized)
bedrock.invoke_model(modelId=model, body=json.dumps({'max_tokens': 500}))
# Or use cheaper model
if task == 'classification':
    model = 'anthropic.claude-3-haiku-20250307-v1:0'  # 80% cheaper
```

### Days 19-21: Implement Remaining Recommendations

- [ ] Batch processing for non-urgent workloads
- [ ] Error rate reduction
- [ ] Retry logic optimization
- [ ] Usage monitoring per application

**Expected Week 3 Savings:**
```
Model substitution:      $70
Prompt caching:          $60
Output reduction:        $20
Batch processing:        $45
─────────────────────────────
TOTAL:                  $195/week → $780/month
```

---

## Phase 4: Production Rollout (Week 4)

### Days 22-24: Final Testing

- [ ] All guardrails tested and working
- [ ] All optimizations implemented and verified
- [ ] Team trained on new limits and procedures
- [ ] Fallback procedures documented
- [ ] Escalation process established
- [ ] Run load test with production traffic profile

**Load Test Checklist:**
- [ ] 10x normal request volume
- [ ] Monitor Lambda cold starts
- [ ] Check DynamoDB throttling
- [ ] Verify SNS delivery
- [ ] Check API Gateway limits

### Days 25-27: Production Deployment

**Monday: Enable PROD Guardrails (Non-Strict)**
- [ ] Switch production to proxy Lambda
- [ ] Set limits at 150% of projected usage
- [ ] Monitor closely (on-call support)
- [ ] Review first 24 hours of logs

**Tuesday-Wednesday: Gradual Tightening**
- [ ] Day 1: Limits at 150%
- [ ] Day 2: Limits at 125%
- [ ] Day 3: Limits at 110%
- [ ] Day 4: Limits at 100% (target)

**Thursday-Friday: Production Optimization**
- [ ] Enable recommendations dashboard
- [ ] Train operations team
- [ ] Set up automated reporting
- [ ] Establish daily monitoring cadence

---

## Week 5+: Maintenance & Monitoring

### Ongoing Tasks

**Daily (Automated)**
- [ ] Check cost alerts
- [ ] Review blocked requests
- [ ] Monitor optimization recommendations
- [ ] Alert on anomalies

**Weekly**
- [ ] [ ] Review spending trends
- [ ] Cost vs budget analysis
- [ ] Implement new recommendations
- [ ] Team standup on cost metrics

**Monthly**
- [ ] [ ] Full cost governance review
- [ ] Adjust limits if needed
- [ ] Stakeholder reporting
- [ ] FinOps review meeting

---

## Success Metrics

### By End of Week 4

| Metric | Target | Current | Gap |
|--------|--------|---------|-----|
| Cost reduction | 30-40% | $0 | $XXX |
| Blocked requests | < 1% | 0% | ✓ |
| API availability | > 99.9% | 100% | ✓ |
| Recommendation adoption | 80% | 0% | $XXX |
| Team adoption | 100% | 0% | 0 teams |

### By End of Month 1

```
Expected Results:
- Total cost reduction: 35% ($XXX → $XXX/month)
- Recommendations implemented: 8/10
- Team satisfaction: 4.2/5
- Incidents: 0 critical, 1 minor
```

---

## Rollback Procedure

If issues arise, rollback in order:

1. **Disable request blocker** (1 minute)
   ```bash
   aws lambda update-function-code \
     --function-name bedrock-proxy \
     --environment Variables="{ENFORCE_LIMITS=false}"
   ```

2. **Remove from production routing** (5 minutes)
   ```bash
   # Route traffic back to direct Bedrock API
   aws apigateway update-resource \
     --rest-api-id sh0xxez42b \
     --resource-id <bedrock-invoke> \
     --patch-operations 'op=remove,path=/pathPart'
   ```

3. **Disable recommendations** (1 minute)
   ```bash
   aws events disable-rule --name bedrock-recommendations-every-6h
   aws events disable-rule --name bedrock-optimization-daily
   ```

4. **Full system disable** (5 minutes)
   ```bash
   aws events disable-rule --name bedrock-cost-check-hourly
   # Stop all governance components
   ```

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| API timeout | Low | High | Add timeout handling, fallback |
| Over-blocking | Medium | High | Conservative limits, gradual tightening |
| Integration bugs | Low | Medium | Extensive testing, canary deployment |
| Team resistance | Medium | Medium | Training, clear documentation |

---

## Team Training

### For Developers

- [ ] How to use proxy endpoint
- [ ] How to handle 429 responses
- [ ] How to check current spending
- [ ] How to implement recommendations

**Training Time: 30 minutes**

### For Operations

- [ ] Monitoring dashboard
- [ ] Alert escalation
- [ ] Limit adjustment procedure
- [ ] Emergency disable procedure

**Training Time: 1 hour**

### For Finance/Leadership

- [ ] Monthly cost trends
- [ ] Savings achieved
- [ ] ROI calculation
- [ ] Future roadmap

**Training Time: 30 minutes**

---

## Documentation to Create

Before going live, document:

- [ ] System architecture diagram
- [ ] API endpoint documentation
- [ ] Alert response runbook
- [ ] Limit adjustment procedure
- [ ] FAQ and troubleshooting
- [ ] Contact info for escalation
- [ ] Cost allocation methodology

---

## Sign-Off Checklist

Before production deployment, get approval from:

- [ ] Engineering Lead: _________________ Date: _____
- [ ] Operations Lead: _________________ Date: _____
- [ ] Finance/Cost Owner: _________________ Date: _____
- [ ] Security Lead: _________________ Date: _____

---

## Go-Live Date: ________________

Target Timeline:
- Phase 1 (Week 1): ☐ Complete
- Phase 2 (Week 2-3): ☐ Complete
- Phase 3 (Week 3-4): ☐ Complete
- Phase 4 (Week 4): ☐ Complete

**Production Launch: ________________**

---

## Post-Launch Support

**Week 1: High Alert**
- [ ] 24/7 on-call coverage
- [ ] Daily sync with team
- [ ] Monitor every metric

**Week 2-3: Normal Alert**
- [ ] Business hours support
- [ ] Daily monitoring reports
- [ ] Team standups

**Week 4+: Standard Operations**
- [ ] Weekly reviews
- [ ] Monthly optimization
- [ ] Quarterly business reviews

---

*Last Updated: July 13, 2026*
*Created for AWS Account: 737185589565*
*Contact: ashish.anand@redingtongroup.com*
