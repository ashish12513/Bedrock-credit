# BEDROCK SENTINEL AI - AWS DEPLOYMENT (LIVE)

## Current Status
- ✅ AWS Access: Granted (Account: 737185589565)
- ✅ AWS Credentials: Configured & Verified
- ✅ Node.js: v24.16.0
- ✅ AWS CLI: v2.33.6
- ✅ Local App: Ready to deploy

## Deployment Options (Pick One)

### 🚀 OPTION 1: EC2 + PM2 (RECOMMENDED - Simplest)
Estimated time: 15-20 minutes
Cost: ~$5-10/month (eligible for free tier)

### 🐳 OPTION 2: Docker + ECS (Advanced)
Estimated time: 25-30 minutes
Cost: ~$15-20/month (auto-scaling capable)

### ⚡ OPTION 3: Lambda (Serverless - No servers)
Estimated time: 10-15 minutes
Cost: Pay per invocation (~free for low traffic)

---

## OPTION 1: QUICK EC2 DEPLOYMENT (RECOMMENDED)

### Step 1: Create IAM Role for EC2

```bash
# Create the role
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

### Step 2: Create and Attach Policy

```bash
# Create policy
cat > /tmp/bedrock-policy.json << 'POLICY'
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
        "cloudwatch:GetMetricStatistics"
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
POLICY

# Attach policy
aws iam put-role-policy \
  --role-name BedrockSentinelEC2Role \
  --policy-name BedrockSentinelPolicy \
  --policy-document file:///tmp/bedrock-policy.json
```

### Step 3: Create Instance Profile

```bash
# Create instance profile
aws iam create-instance-profile \
  --instance-profile-name BedrockSentinelProfile

# Add role to profile
aws iam add-role-to-instance-profile \
  --instance-profile-name BedrockSentinelProfile \
  --role-name BedrockSentinelEC2Role
```

### Step 4: Create Security Group

```bash
# Create security group
SG_ID=$(aws ec2 create-security-group \
  --group-name bedrock-sentinel-sg \
  --description "Bedrock Sentinel Dashboard Security Group" \
  --query 'GroupId' \
  --output text)

# Allow HTTP (port 80)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 80 --cidr 0.0.0.0/0

# Allow HTTPS (port 443)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 443 --cidr 0.0.0.0/0

# Allow App (port 3000)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 3000 --cidr 0.0.0.0/0

# Allow SSH (port 22)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 22 --cidr 0.0.0.0/0
```

### Step 5: Create Key Pair and Launch Instance

```bash
# Create key pair
aws ec2 create-key-pair \
  --key-name bedrock-sentinel \
  --query 'KeyMaterial' \
  --output text > ~/.ssh/bedrock-sentinel.pem

chmod 600 ~/.ssh/bedrock-sentinel.pem

# Get latest Amazon Linux 2 AMI
AMI_ID=$(aws ec2 describe-images \
  --owners amazon \
  --filters "Name=name,Values=amzn2-ami-hvm-*-x86_64-gp2" \
  "Name=state,Values=available" \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
  --output text)

# Launch instance (t3.micro = free tier eligible)
INSTANCE_ID=$(aws ec2 run-instances \
  --image-id $AMI_ID \
  --instance-type t3.micro \
  --key-name bedrock-sentinel \
  --security-group-ids $SG_ID \
  --iam-instance-profile Name=BedrockSentinelProfile \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=bedrock-sentinel}]' \
  --query 'Instances[0].InstanceId' \
  --output text)

echo "Instance launching: $INSTANCE_ID"
sleep 30

# Get public IP
PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)

echo "✓ Instance public IP: $PUBLIC_IP"
```

### Step 6: SSH and Deploy

```bash
# Wait 1-2 minutes for instance to fully boot
ssh -i ~/.ssh/bedrock-sentinel.pem ec2-user@$PUBLIC_IP

# Once connected:
sudo yum update -y
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs git

# Clone or copy your app
git clone your-repo-url bedrock-sentinel
cd bedrock-sentinel/app
npm install

# Create .env
cat > .env << 'ENV'
USE_REAL_BEDROCK=true
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=737185589565
NODE_ENV=production
PORT=3000
ENV

# Install and start with PM2
sudo npm install -g pm2
pm2 start src/server.js --name bedrock-sentinel
pm2 startup systemd -u ec2-user
pm2 save
```

### Step 7: Access Dashboard

Open browser: `http://$PUBLIC_IP:3000`

---

## Testing Deployment

```bash
# Test accessibility
curl http://$PUBLIC_IP:3000

# Test Bedrock integration
curl -X POST http://$PUBLIC_IP:3000/api/bedrock/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is AWS Bedrock?"}'

# Test cost data
curl http://$PUBLIC_IP:3000/api/cost/summary
```

---

## Monitoring

```bash
# View logs
pm2 logs bedrock-sentinel

# Check status
pm2 status

# Restart app
pm2 restart bedrock-sentinel
```

---

## Cleanup

```bash
# Terminate instance
aws ec2 terminate-instances --instance-ids $INSTANCE_ID

# Delete security group (after termination)
aws ec2 delete-security-group --group-id $SG_ID

# Delete key pair
aws ec2 delete-key-pair --key-name bedrock-sentinel

# Delete IAM resources
aws iam delete-instance-profile --instance-profile-name BedrockSentinelProfile
aws iam delete-role-policy --role-name BedrockSentinelEC2Role --policy-name BedrockSentinelPolicy
aws iam delete-role --role-name BedrockSentinelEC2Role
```

---

## Estimated Monthly Costs

| Component | Cost |
|-----------|------|
| EC2 t3.micro | $5-10 (free tier) |
| Data transfer | ~$1 |
| CloudWatch | ~$0.30 |
| Bedrock API | Variable |
| **TOTAL** | **$6-11 + Bedrock** |

---

## Production Checklist

- [ ] Enable VPC and private subnets
- [ ] Use Application Load Balancer
- [ ] Set up auto-scaling
- [ ] Enable CloudWatch monitoring
- [ ] Set up SSL/HTTPS with ACM
- [ ] Configure CloudTrail logging
- [ ] Set up SNS alerts
- [ ] Enable backup/disaster recovery
