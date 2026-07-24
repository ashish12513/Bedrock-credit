# BEDROCK SENTINEL - Implementation Guide

**For:** DevOps, Infrastructure, Technical Project Managers  
**Duration:** 2-4 weeks  
**Effort:** 80-120 hours  

---

## Phase Overview

| Phase | Duration | Team | Deliverable |
|-------|----------|------|-------------|
| **Phase 1: Foundation** | 1-2 weeks | 2-3 engineers | Dashboard operational |
| **Phase 2: Multi-Account** | 1-2 weeks | 1-2 engineers | Cross-account management |
| **Phase 3: Governance** | 2-3 weeks | 2-3 engineers | Quota enforcement, auto-optimization |
| **Phase 4: Enterprise** | 2-4 weeks | 2-4 engineers | Advanced features, compliance |

**Current Status:** Phase 1 COMPLETE ✅

---

## Phase 1: Foundation (COMPLETE ✅)

### Objectives
- [x] Deploy Node.js application
- [x] Set up dashboard UI
- [x] Integrate with AWS Bedrock (basic)
- [x] Create admin control panel
- [x] Implement chat endpoint
- [x] Set up real-time metrics

### Deliverables

#### 1. Application Deployed
- Express.js server running on port 3000
- All routes responsive
- Real-time metrics updating
- Admin API endpoints active

**Verification:**
```bash
curl http://localhost:3000
# Should return dashboard HTML

curl http://localhost:3000/api/admin/accounts
# Should return account list
```

#### 2. Dashboard Operational
- KPI cards displaying real data ($3.94, 723k tokens)
- Admin control panel visible
- Chatbot sidebar functional
- All buttons clickable

**Verification:**
Open `http://localhost:3000` in browser and verify:
- [ ] Dashboard loads without errors
- [ ] Real S3 data displayed
- [ ] Chatbot responds to messages
- [ ] Edit Quota button works
- [ ] Model toggles functional
- [ ] Alerts section shows data

#### 3. Chat Endpoint Working
- Claude responses (demo or live mode)
- Cost tracking per message
- Conversation history maintained
- Real token counting

**Verification:**
```bash
curl -X POST http://localhost:3000/api/bedrock/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "test"}'

# Response should include:
# - success: true
# - message: (response text)
# - cost: (calculated)
# - tokens: (count)
```

#### 4. Admin Controls
- Account management
- Model access toggles
- Quota editing
- Alert management

**Verification:**
- [ ] Can view account list
- [ ] Can edit quotas
- [ ] Can toggle models
- [ ] Can acknowledge alerts

---

## Phase 2: Multi-Account (Starting Week 3)

### Objectives
- [ ] Set up cross-account IAM roles
- [ ] Implement AssumeRole logic
- [ ] Integrate Cost Explorer
- [ ] Build organization dashboard
- [ ] Add multi-account filtering

### Tasks

#### Task 1: IAM Role Setup (3 days)

**Member Account Configuration:**

Create IAM role in each member account:

```bash
# In member account
aws iam create-role \
  --role-name BedrockSentinelCrossAccountRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::MAIN_ACCOUNT_ID:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "bedrock-sentinel-governance"
        }
      }
    }]
  }'

# Attach Bedrock policy
aws iam attach-role-policy \
  --role-name BedrockSentinelCrossAccountRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonBedrockFullAccess
```

**Main Account Configuration:**

Ensure main account has permissions to assume role:

```bash
aws iam put-role-policy \
  --role-name BedrockSentinelRole \
  --policy-name AssumeCrossAccountRole \
  --policy-document '{
    "Effect": "Allow",
    "Action": "sts:AssumeRole",
    "Resource": "arn:aws:iam::*:role/BedrockSentinelCrossAccountRole"
  }'
```

#### Task 2: Cost Explorer Integration (5 days)

**Objective:** Fetch multi-account costs

**Implementation:**

```javascript
// multi-account-aggregator.js
async getBedrockCostForAccount(accountId, startDate, endDate) {
  const credentials = await this.assumeRole(accountId);
  const client = new CostExplorerClient({ 
    region: 'us-east-1',
    credentials 
  });

  const result = await client.send(new GetCostAndUsageCommand({
    TimePeriod: { Start: startDate, End: endDate },
    Granularity: 'DAILY',
    Metrics: ['UnblendedCost'],
    Filter: {
      Dimensions: {
        Key: 'SERVICE',
        Values: ['Amazon Bedrock']
      }
    }
  }));

  return result;
}
```

**Testing:**
```bash
# Test with dev account
curl http://localhost:3000/api/admin/usage?accountId=DEV_ACCOUNT_ID

# Should return costs for that account
```

#### Task 3: Organization Dashboard (7 days)

**Add new endpoints:**

```javascript
// GET /api/admin/organization/summary
GET /api/organization/summary
Response:
{
  "totalMonthlySpend": 15000,
  "accounts": [...],
  "trend": [...],
  "topAccounts": [...]
}

// GET /api/admin/organization/accounts
GET /api/organization/accounts
Response:
{
  "accounts": [
    {
      "id": "123456789012",
      "name": "Production",
      "monthlySpend": 5000,
      "trend": "up"
    }
  ]
}
```

**UI Updates:**

Add new dashboard sections:
- Organization spending trend
- Account breakdown pie chart
- Cost per model graph
- Usage by time of day

#### Task 4: Testing (3 days)

**Test matrix:**

| Scenario | Expected | Status |
|----------|----------|--------|
| Query dev account | Returns cost | ✅ |
| Query prod account | Returns cost | ⏳ |
| Query QA account | Returns cost | ⏳ |
| Sum all accounts | Total matches | ⏳ |
| Dashboard displays | All accounts | ⏳ |
| Filters work | Correct subset | ⏳ |

---

## Phase 3: Governance (Starting Week 5)

### Objectives
- [ ] Implement quota enforcement engine
- [ ] Build auto-optimization logic
- [ ] Create alert system (email/Slack)
- [ ] Add budget forecasting
- [ ] Enable model recommendations

### Tasks

#### Task 1: Quota Enforcement Engine (10 days)

**Core Logic:**

```javascript
// quota-engine.js
async checkQuotaCompliance(accountId, costIncrement) {
  // 1. Get quota from DynamoDB
  const quota = await getQuota(accountId);
  
  // 2. Get current spend
  const currentSpend = await getCurrentSpend(accountId);
  
  // 3. Check limits
  if (currentSpend + costIncrement > quota.monthlyLimit) {
    return { allowed: false, reason: 'monthly_limit_exceeded' };
  }
  
  if (currentSpend + costIncrement > quota.dailyLimit) {
    return { allowed: false, reason: 'daily_limit_exceeded' };
  }
  
  // 4. Check model-specific limits
  const modelQuota = await getModelQuota(accountId, modelId);
  if (modelCost > modelQuota.limit) {
    return { allowed: false, reason: 'model_limit_exceeded' };
  }
  
  return { allowed: true };
}
```

**Integration:**

Modify chat endpoint to enforce:

```javascript
router.post('/chat', async (req, res) => {
  const { message, accountId } = req.body;
  
  // Check quota BEFORE calling Claude
  const quotaCheck = await quotaEngine.checkCompliance(accountId, 0.001);
  
  if (!quotaCheck.allowed) {
    return res.status(429).json({
      error: 'Quota exceeded',
      reason: quotaCheck.reason,
      currentSpend: quotaCheck.spent,
      limit: quotaCheck.limit
    });
  }
  
  // Proceed with Claude call...
});
```

#### Task 2: Auto-Optimization (8 days)

**Logic:**

```javascript
// optimizer.js
async recommendModelOptimization(accountId) {
  // 1. Analyze recent usage
  const usage = await getUsageAnalytics(accountId);
  
  // 2. Identify optimization opportunities
  const recommendations = [];
  
  if (usage.sonnetPercentage > 70) {
    // If mostly using Sonnet, suggest Haiku for 30%
    recommendations.push({
      type: 'model_switch',
      from: 'Claude 3.5 Sonnet',
      to: 'Claude 3 Haiku',
      potentialSavings: usage.cost * 0.35,
      confidence: 0.85
    });
  }
  
  // 3. Generate suggestions
  return recommendations;
}

// Auto-apply recommendations
async autoOptimize(accountId) {
  const recommendations = await this.recommend(accountId);
  
  for (const rec of recommendations) {
    if (rec.confidence > 0.9) {
      // Auto-apply high-confidence suggestions
      await applyOptimization(accountId, rec);
      await notifyAdmin(accountId, rec);
    }
  }
}
```

**Scheduler:**

```javascript
// Run every 6 hours
schedule.scheduleJob('0 */6 * * *', async () => {
  const accounts = await getAllAccounts();
  for (const account of accounts) {
    await optimizer.autoOptimize(account.id);
  }
});
```

#### Task 3: Alert System (10 days)

**Email Alerts:**

```javascript
// alerts.js
async sendQuotaAlert(accountId, level) {
  const account = await getAccount(accountId);
  const spend = await getCurrentSpend(accountId);
  const quota = await getQuota(accountId);
  
  const template = {
    subject: `Alert: ${account.name} at ${level}% quota`,
    body: `
      Account: ${account.name}
      Current Spend: $${spend}
      Monthly Limit: $${quota.monthlyLimit}
      Usage: ${(spend/quota.monthlyLimit*100).toFixed(1)}%
      
      Action: Review usage or increase quota
    `
  };
  
  await sendEmail(account.adminEmail, template);
}
```

**Slack Integration:**

```javascript
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

async function sendSlackAlert(accountId, level) {
  await slack.chat.postMessage({
    channel: '#bedrock-alerts',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🚨 *${accountId} at ${level}% quota*`
        }
      }
    ]
  });
}
```

#### Task 4: Testing (5 days)

**Automation test:**

```bash
# Set low quota for test account
POST /api/admin/quotas
{
  "accountId": "test-account",
  "monthlyLimit": 10
}

# Send multiple chat requests
for i in {1..20}; do
  curl -X POST http://localhost:3000/api/bedrock/chat \
    -d '{"message": "test", "accountId": "test-account"}'
done

# Verify blocking after limit
# Verify alerts sent
# Verify DynamoDB updated
```

---

## Phase 4: Enterprise (Starting Week 9)

### High-level Tasks
- [ ] Custom reporting (PDF export)
- [ ] ML-based cost forecasting
- [ ] Chargeback system (bill teams)
- [ ] Compliance audit reports
- [ ] Advanced analytics

### Estimated Effort
- 2-4 weeks
- 2-4 engineers
- Depends on customizations

---

## Deployment Checklist

### Pre-Deployment

- [ ] All code committed to git
- [ ] Tests passing (if applicable)
- [ ] Security review completed
- [ ] Performance tested (load testing)
- [ ] Documentation updated
- [ ] Stakeholders approved

### Deployment Steps

#### 1. EC2 Deployment (Recommended)

```bash
# Create EC2 instance
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.small \
  --key-name your-key \
  --security-groups bedrock-sentinel-sg

# SSH into instance
ssh -i your-key.pem ubuntu@instance-ip

# Install dependencies
sudo apt-get update
sudo apt-get install -y nodejs npm git

# Clone repository
git clone your-repo-url
cd bedrock-sentinel/app

# Install npm packages
npm install

# Configure environment
cp .env.example .env
nano .env  # Add AWS credentials, ports, etc

# Start application
npm start

# (Optional) Use PM2 for auto-restart
sudo npm install -g pm2
pm2 start src/server.js --name bedrock-sentinel
pm2 startup
pm2 save
```

#### 2. Docker Deployment

```bash
# Build image
docker build -t bedrock-sentinel:latest .

# Push to ECR
aws ecr create-repository --repository-name bedrock-sentinel
aws ecr get-login-password | docker login --username AWS \
  --password-stdin YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com
docker tag bedrock-sentinel:latest \
  YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/bedrock-sentinel:latest
docker push YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/bedrock-sentinel:latest

# Deploy to ECS (if applicable)
aws ecs create-service \
  --cluster bedrock-sentinel \
  --service-name bedrock-sentinel-service \
  --task-definition bedrock-sentinel:1 \
  --desired-count 2
```

### Post-Deployment

- [ ] Access dashboard at URL
- [ ] Run smoke tests
- [ ] Verify all endpoints
- [ ] Check logs for errors
- [ ] Monitor metrics
- [ ] Train users

---

## Monitoring & Maintenance

### Daily Tasks
- Monitor CloudWatch dashboard
- Check for errors in logs
- Verify quota enforcement working
- Respond to alerts

### Weekly Tasks
- Review spending trends
- Check for security issues
- Update any dependencies
- Test disaster recovery

### Monthly Tasks
- Performance review
- Capacity planning
- Security audit
- Cost analysis

---

## Troubleshooting Guide

### Dashboard Not Loading

```bash
# Check if server is running
ps aux | grep "node src/server"

# Check logs
tail -f /var/log/bedrock-sentinel.log

# Restart if needed
pm2 restart bedrock-sentinel

# Check port
netstat -tlnp | grep 3000
```

### Chat Not Responding

```bash
# Check Bedrock permissions
aws bedrock list-foundation-models --region us-east-1

# Check credentials
aws sts get-caller-identity

# Check error logs
grep -i error /var/log/bedrock-sentinel.log

# Test endpoint
curl -X POST http://localhost:3000/api/bedrock/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "test"}'
```

### Quota Not Enforcing

```bash
# Check DynamoDB table
aws dynamodb scan --table-name bedrock-sentinel-quotas

# Check quota enforcement logic
grep -n "checkQuota" src/utils/quota-engine.js

# Verify values in database
aws dynamodb get-item \
  --table-name bedrock-sentinel-quotas \
  --key '{"accountId":{"S":"production-main"}}'
```

---

## Success Criteria

### Phase 1 ✅
- [x] Dashboard operational
- [x] Chat endpoint working
- [x] Admin controls functional
- [x] Real data displayed

### Phase 2
- [ ] Multi-account dashboard
- [ ] Cross-account cost aggregation
- [ ] All accounts visible
- [ ] Filtering working

### Phase 3
- [ ] Quota enforcement active
- [ ] Auto-optimization suggestions generated
- [ ] Alerts triggering correctly
- [ ] Budget forecasting accurate

### Phase 4
- [ ] Custom reports generated
- [ ] Chargeback system working
- [ ] Compliance audit ready
- [ ] Advanced analytics active

---

## Budget & Resource Allocation

### Phase 1 (Complete)
- Budget: $5000-10000
- Resources: 2-3 engineers for 2 weeks
- Timeline: 1-2 weeks

### Phase 2 (Upcoming)
- Budget: $3000-5000
- Resources: 1-2 engineers for 2 weeks
- Timeline: 1-2 weeks

### Phase 3 (Upcoming)
- Budget: $8000-12000
- Resources: 2-3 engineers for 3 weeks
- Timeline: 2-3 weeks

### Phase 4 (Planned)
- Budget: $10000-20000
- Resources: 2-4 engineers for 4 weeks
- Timeline: 2-4 weeks

**Total Project:** $26000-47000 over 8-12 weeks

---

## Conclusion

This implementation guide provides a roadmap from foundation to enterprise-ready system. Each phase builds upon the previous, allowing for incremental value delivery and adjustment based on organizational needs.

**Current Status:** Phase 1 Complete ✅  
**Next Milestone:** Phase 2 kick-off (Week 3)
