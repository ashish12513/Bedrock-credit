# AWS ADMIN REQUIRED: Bedrock Sentinel Deployment Setup

## ⚠️ Status: Access Limited

Your AWS user account (ashish.anand@redingtongroup.com) has **Bedrock access** but **lacks IAM and EC2 management permissions** needed for automated deployment.

✅ What You CAN Do:
- Invoke Bedrock models (Claude 3.5 Sonnet, Haiku, etc.)
- Access Cost Explorer data
- Call Bedrock APIs directly

❌ What You CANNOT Do (Requires AWS Admin):
- Create IAM roles
- Create EC2 instances
- Create security groups
- Create key pairs
- Manage CloudFormation stacks

---

## SOLUTION: AWS Admin Must Run These Commands

Ask your AWS Administrator to run the following commands **once** to set up the infrastructure:

### 1. Create IAM Role for Application

```bash
aws iam create-role \
  --role-name BedrockSentinelEC2Role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ec2.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'
```

### 2. Create and Attach Policy

```bash
cat > /tmp/bedrock-policy.json << 'EOF'
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
        "ce:GetCostAndUsage",
        "ce:GetCostForecast",
        "cloudwatch:GetMetricStatistics",
        "cloudwatch:GetMetricData"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name BedrockSentinelEC2Role \
  --policy-name BedrockSentinelPolicy \
  --policy-document file:///tmp/bedrock-policy.json
```

### 3. Create Instance Profile

```bash
aws iam create-instance-profile \
  --instance-profile-name BedrockSentinelProfile

aws iam add-role-to-instance-profile \
  --instance-profile-name BedrockSentinelProfile \
  --role-name BedrockSentinelEC2Role
```

### 4. Create Security Group

```bash
# Create security group
SG_ID=$(aws ec2 create-security-group \
  --group-name bedrock-sentinel-sg \
  --description "Bedrock Sentinel Dashboard Security Group" \
  --query 'GroupId' \
  --output text)

# Allow HTTP
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 80 --cidr 0.0.0.0/0

# Allow HTTPS
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 443 --cidr 0.0.0.0/0

# Allow App Port
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 3000 --cidr 0.0.0.0/0

# Allow SSH (restrict to admin IP)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 22 --cidr 0.0.0.0/0

echo "Security Group ID: $SG_ID"
```

### 5. Create SSH Key Pair

```bash
# Create and save key pair
aws ec2 create-key-pair \
  --key-name bedrock-sentinel \
  --query 'KeyMaterial' \
  --output text > ~/.ssh/bedrock-sentinel.pem

chmod 600 ~/.ssh/bedrock-sentinel.pem

echo "Key saved to: ~/.ssh/bedrock-sentinel.pem"
```

### 6. Launch EC2 Instance

```bash
# Get latest Amazon Linux 2 AMI
AMI_ID=$(aws ec2 describe-images \
  --owners amazon \
  --filters "Name=name,Values=amzn2-ami-hvm-*-x86_64-gp2" \
  "Name=state,Values=available" \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
  --output text)

echo "Using AMI: $AMI_ID"

# Launch instance
INSTANCE_ID=$(aws ec2 run-instances \
  --image-id $AMI_ID \
  --instance-type t3.micro \
  --key-name bedrock-sentinel \
  --security-group-ids $SG_ID \
  --iam-instance-profile Name=BedrockSentinelProfile \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=bedrock-sentinel}]' \
  --query 'Instances[0].InstanceId' \
  --output text)

echo "Instance ID: $INSTANCE_ID"

# Wait and get IP
sleep 30
PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)

echo "Public IP: $PUBLIC_IP"
echo ""
echo "Next: SSH into the instance and run the deployment script"
```

---

## Once Infrastructure is Ready

After your AWS Admin sets up the infrastructure above, **you can proceed with deployment**:

### Step 1: SSH into EC2 Instance

```bash
# Replace INSTANCE_IP with the IP provided by admin
ssh -i ~/.ssh/bedrock-sentinel.pem ec2-user@INSTANCE_IP
```

### Step 2: Deploy Application

```bash
# Update system
sudo yum update -y

# Install Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs git

# Get your application code
# Option A: Clone from git repository
git clone YOUR_REPO_URL bedrock-sentinel
cd bedrock-sentinel/app

# Option B: Or copy files manually from your computer
# scp -i ~/.ssh/bedrock-sentinel.pem -r /path/to/app/* ec2-user@INSTANCE_IP:/home/ec2-user/bedrock-sentinel/app/

# Install dependencies
npm install

# Create .env file
cat > .env << 'ENV'
USE_REAL_BEDROCK=true
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=737185589565
NODE_ENV=production
PORT=3000
ENV

# Install PM2 (process manager)
sudo npm install -g pm2

# Start application
pm2 start src/server.js --name bedrock-sentinel

# Set up to restart on reboot
pm2 startup systemd -u ec2-user --hp /home/ec2-user
pm2 save

echo "✓ Application is running!"
```

### Step 3: Verify Deployment

```bash
# From your local machine
INSTANCE_IP=<ip-from-admin>

# Test dashboard
curl http://$INSTANCE_IP:3000

# Test Bedrock integration
curl -X POST http://$INSTANCE_IP:3000/api/bedrock/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is cost optimization?"}'

# Test cost data
curl http://$INSTANCE_IP:3000/api/cost/summary
```

### Step 4: Access Dashboard

Open in browser:
```
http://INSTANCE_IP:3000
```

You should see:
- Real-time Bedrock cost tracking
- Claude chatbot responses (live from Bedrock)
- AWS cost analysis
- Model usage statistics

---

## Application Features Available Once Deployed

### ✅ Cost Governance
- Real-time Bedrock spending
- Cost forecasting
- Usage analytics
- Daily/weekly/monthly trends

### ✅ AI Assistant (Claude 3.5 Sonnet)
- Live Bedrock integration
- Real token counting
- Cost per query tracking
- Model selection options

### ✅ Admin Controls
- Cost quotas and alerts
- Model enable/disable
- Rate limiting
- Auto-shutdown at threshold

### ✅ Dashboard
- Real-time metrics
- Cost breakdown by model
- Usage patterns
- Historical data

---

## Estimated Costs

| Component | Monthly Cost |
|-----------|--------------|
| EC2 t3.micro | $5-10 (free tier eligible) |
| Data transfer | ~$1 |
| CloudWatch | ~$0.30 |
| Bedrock API | Variable (per token) |
| **TOTAL** | **$6-11 + Bedrock usage** |

**Example Bedrock Costs:**
- Claude 3.5 Sonnet: ~$0.003 per 1K input tokens
- 1M tokens/day = ~$3/month
- 10M tokens/day = ~$30/month

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Cannot SSH" | Check security group allows SSH (port 22) |
| "Application not starting" | Run `pm2 logs bedrock-sentinel` on EC2 |
| "Bedrock errors" | Verify IAM role has `bedrock:InvokeModel` permission |
| "Cost data not showing" | Ensure `ce:GetCostAndUsage` permission in role |
| "502 Bad Gateway" | Restart app: `pm2 restart bedrock-sentinel` |

---

## Admin Contact Template

**Subject: AWS Infrastructure Setup for Bedrock Sentinel AI**

Please run the commands in sections 1-6 above to set up:
- ✅ IAM Role (BedrockSentinelEC2Role)
- ✅ Security Group (bedrock-sentinel-sg)  
- ✅ EC2 Instance (t3.micro, free tier)
- ✅ SSH Key Pair (bedrock-sentinel)
- ✅ IAM Instance Profile

Once set up, provide me with:
- Instance public IP address
- Instance ID
- SSH key pair file

I will then deploy and test the application.
