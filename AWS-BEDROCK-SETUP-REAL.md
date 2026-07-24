# AWS Bedrock Real Integration Setup

This guide helps you connect the Bedrock Sentinel Dashboard to **real AWS Bedrock** accounts instead of using demonstration mode.

## Prerequisites

1. **AWS Account(s)** with Bedrock access
2. **AWS CLI** configured with credentials
3. **Node.js 16+** and npm
4. **Docker** (optional, for containerized deployment)

## Step 1: Enable Bedrock in Your AWS Account

### Single Account Setup

```bash
# Login to AWS Console → Navigate to Amazon Bedrock
# Click "Get Started" or "Enable"
# Accept model access terms for Claude models
# Note your AWS Account ID (e.g., 737185589565)
```

### Multi-Account Setup

Create an IAM role in member accounts that allows the main account to assume it:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
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
    }
  ]
}
```

## Step 2: Configure AWS Credentials

### Option A: Local Development (AWS CLI)

```bash
# Configure AWS credentials
aws configure

# Enter:
# AWS Access Key ID: YOUR_ACCESS_KEY
# AWS Secret Access Key: YOUR_SECRET_KEY
# Default region: us-east-1
# Default output format: json

# Verify credentials
aws sts get-caller-identity
```

### Option B: IAM Role (EC2/ECS/Lambda)

If running on AWS infrastructure, attach an IAM policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "arn:aws:bedrock:*:*:foundation-model/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sts:AssumeRole"
      ],
      "Resource": "arn:aws:iam::*:role/BedrockSentinelCrossAccountRole"
    }
  ]
}
```

### Option C: Environment Variables

```bash
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_REGION="us-east-1"
```

## Step 3: Update Application Configuration

### File: `/app/.env`

```bash
# Enable real Bedrock (not demonstration mode)
USE_REAL_BEDROCK=true

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=737185589565

# For Single Account, leave these as defaults:
ACCOUNT_ID=production-main

# For Multi-Account Access:
# Uncomment and configure for cross-account role assumption
# CROSS_ACCOUNT_ROLE_ARN=arn:aws:iam::ACCOUNT_ID:role/BedrockSentinelCrossAccountRole
# CROSS_ACCOUNT_EXTERNAL_ID=bedrock-sentinel-governance

# Fallback API (only used if real Bedrock fails)
GOVERNANCE_API=https://sh0xxez42b.execute-api.us-east-1.amazonaws.com/prod

NODE_ENV=production
PORT=3000
```

## Step 4: Install Dependencies

```bash
cd /Users/ashishanand/Desktop/Bedrock-credit/app

# Install AWS SDK v3 for Bedrock
npm install

# Verify installation
npm list @aws-sdk/client-bedrock-runtime
```

## Step 5: Test Real Bedrock Connection

### Start the Application

```bash
cd /Users/ashishanand/Desktop/Bedrock-credit/app

# Development mode with auto-reload
npm run dev

# Or production mode
npm start

# Should output:
# Using REAL AWS Bedrock client
# Server running on http://localhost:3000
```

### Test Chat Endpoint

```bash
# Test with real Bedrock
curl -X POST http://localhost:3000/api/bedrock/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is the capital of France?",
    "accountId": "production-main"
  }'

# Expected response (REAL):
# {
#   "success": true,
#   "message": "The capital of France is Paris...",
#   "cost": 0.000123,
#   "mode": "live",
#   "note": "Response from real AWS Bedrock with cost tracking enabled"
# }
```

### Test Dashboard

Open browser: **http://localhost:3000**

You should see:
- ✅ Real metrics from AWS Bedrock (not demonstration values)
- ✅ Actual token counts and costs
- ✅ Live Claude responses in the chatbot sidebar
- ✅ Admin controls for quota management

## Step 6: Deploy to AWS

### Option A: EC2 Instance

```bash
# SSH into EC2 instance
ssh -i your-key.pem ec2-user@your-instance-ip

# Clone repository
git clone your-repo-url
cd bedrock-sentinel

# Install Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Install dependencies
cd app
npm install

# Create .env from configuration
cp .env.example .env
nano .env  # Edit with your AWS account details

# Start application
npm start

# (Optional) Use PM2 for process management
sudo npm install -g pm2
pm2 start src/server.js --name bedrock-sentinel
pm2 startup
pm2 save
```

### Option B: Docker

```bash
cd /Users/ashishanand/Desktop/Bedrock-credit/app

# Build Docker image
docker build -t bedrock-sentinel:latest .

# Run container with AWS credentials
docker run -d \
  -p 3000:3000 \
  -e USE_REAL_BEDROCK=true \
  -e AWS_REGION=us-east-1 \
  -e AWS_ACCOUNT_ID=737185589565 \
  -v ~/.aws:/root/.aws:ro \
  --name bedrock-sentinel \
  bedrock-sentinel:latest

# View logs
docker logs -f bedrock-sentinel
```

### Option C: ECS with IAM Role

Create ECS task definition with IAM role that has Bedrock permissions:

```json
{
  "family": "bedrock-sentinel",
  "taskRoleArn": "arn:aws:iam::ACCOUNT_ID:role/BedrockSentinelECSTaskRole",
  "executionRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "bedrock-sentinel",
      "image": "bedrock-sentinel:latest",
      "environment": [
        {
          "name": "USE_REAL_BEDROCK",
          "value": "true"
        },
        {
          "name": "AWS_REGION",
          "value": "us-east-1"
        }
      ],
      "portMappings": [
        {
          "containerPort": 3000,
          "hostPort": 3000
        }
      ]
    }
  ]
}
```

## Step 7: Set Up Multi-Account Access

### Create Cross-Account IAM Role (in member accounts)

In each member AWS account, run CloudFormation:

```yaml
Resources:
  BedrockSentinelCrossAccountRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: BedrockSentinelCrossAccountRole
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              AWS: !Sub 'arn:aws:iam::${MainAccountId}:root'
            Action: sts:AssumeRole
            Condition:
              StringEquals:
                sts:ExternalId: bedrock-sentinel-governance
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/AmazonBedrockFullAccess
```

### Configure Main Account

In `.env`:

```bash
CROSS_ACCOUNT_ROLE_ARN=arn:aws:iam::MEMBER_ACCOUNT_ID:role/BedrockSentinelCrossAccountRole
CROSS_ACCOUNT_EXTERNAL_ID=bedrock-sentinel-governance
```

## Step 8: Monitor and Troubleshoot

### Check Logs

```bash
# Application logs
tail -f /var/log/bedrock-sentinel.log

# AWS CloudTrail
aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=InvokeModel

# AWS CloudWatch
aws logs tail /aws/bedrock/invocations --follow
```

### Common Issues

| Issue | Solution |
|-------|----------|
| "Credentials not found" | Configure AWS CLI: `aws configure` |
| "Access Denied" | Ensure IAM policy includes `bedrock:InvokeModel` |
| "Model not found" | Enable Claude model access in Bedrock console |
| "Demonstration mode" | Check `USE_REAL_BEDROCK=true` in `.env` |
| "Cross-account fails" | Verify trust relationship in member account role |

### Test Credentials

```bash
# Verify AWS access
aws sts get-caller-identity

# List Bedrock models
aws bedrock list-foundation-models --region us-east-1

# Test Bedrock invoke (AWS CLI)
aws bedrock-runtime invoke-model \
  --model-id anthropic.claude-3-5-sonnet-20241022-v2:0 \
  --body '{"messages":[{"role":"user","content":"Hello"}],"max_tokens":100}' \
  response.json
```

## API Endpoints (Real Bedrock)

Once configured, you can use:

### Chat Endpoint
```
POST /api/bedrock/chat
Content-Type: application/json

{
  "message": "Your question",
  "conversationHistory": [],
  "accountId": "production-main"
}
```

### Models List
```
GET /api/bedrock/models
```

### Usage Statistics
```
GET /api/bedrock/stats
```

### Admin Dashboard
```
GET http://localhost:3000
```

## Next Steps

1. ✅ Set up real AWS Bedrock connection
2. ⬜ Configure multi-account access if needed
3. ⬜ Deploy to production (EC2/ECS/Lambda)
4. ⬜ Set up monitoring and alerts
5. ⬜ Configure quota limits and governance policies

## Support

For issues or questions:
- Check CloudWatch logs in AWS Console
- Verify IAM permissions
- Test with AWS CLI before using dashboard
- Review error messages in application logs
