# Deploy Bedrock Sentinel Dashboard to AWS

This guide explains how to deploy the Bedrock Sentinel cost governance dashboard to AWS production.

## Quick Deploy (5-10 minutes)

### Prerequisites
- AWS Account with Bedrock enabled
- AWS CLI configured
- Node.js 16+
- Docker (optional)

### Step 1: Enable Real Bedrock Mode

Edit `.env` in the app directory:

```bash
cd /Users/ashishanand/Desktop/Bedrock-credit/app

# Copy the example config
cp .env.example .env

# Edit with your AWS details
nano .env

# Set these values:
USE_REAL_BEDROCK=true
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=737185589565
ACCOUNT_ID=production-main
```

### Step 2: Test Locally

```bash
# Install dependencies
npm install

# Verify AWS credentials
aws sts get-caller-identity

# Test the app
npm start

# In another terminal, test the chat endpoint:
curl -X POST http://localhost:3000/api/bedrock/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, Claude!"}'

# You should see a REAL response from Bedrock, not demonstration mode
```

### Step 3: Deploy to AWS (Choose One)

## Option A: Deploy to EC2

### 1. Create EC2 Instance

```bash
# Create security group
aws ec2 create-security-group \
  --group-name bedrock-sentinel-sg \
  --description "Bedrock Sentinel Dashboard"

SECURITY_GROUP_ID=$(aws ec2 describe-security-groups \
  --filters Name=group-name,Values=bedrock-sentinel-sg \
  --query 'SecurityGroups[0].GroupId' \
  --output text)

# Allow HTTP and SSH
aws ec2 authorize-security-group-ingress \
  --group-id $SECURITY_GROUP_ID \
  --protocol tcp --port 80 --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id $SECURITY_GROUP_ID \
  --protocol tcp --port 3000 --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id $SECURITY_GROUP_ID \
  --protocol tcp --port 22 --cidr YOUR_IP/32

# Launch instance (t3.micro is free tier eligible)
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.micro \
  --security-group-ids $SECURITY_GROUP_ID \
  --key-name your-key-pair \
  --iam-instance-profile Name=BedrockSentinelInstanceProfile
```

### 2. Create IAM Role for EC2

```bash
# Create role
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

# Attach permissions
aws iam put-role-policy \
  --role-name BedrockSentinelEC2Role \
  --policy-name BedrockSentinelPolicy \
  --policy-document '{
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
          "cloudwatch:GetMetricStatistics"
        ],
        "Resource": "*"
      },
      {
        "Effect": "Allow",
        "Action": "sts:AssumeRole",
        "Resource": "arn:aws:iam::*:role/BedrockSentinelCrossAccountRole"
      }
    ]
  }'

# Create instance profile
aws iam create-instance-profile \
  --instance-profile-name BedrockSentinelInstanceProfile

aws iam add-role-to-instance-profile \
  --instance-profile-name BedrockSentinelInstanceProfile \
  --role-name BedrockSentinelEC2Role
```

### 3. Connect and Deploy

```bash
# SSH into instance
ssh -i your-key.pem ec2-user@your-instance-ip

# Install dependencies
sudo yum update -y
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs git

# Clone and setup
git clone your-repo-url
cd bedrock-sentinel/app
npm install

# Create .env with your configuration
cat > .env << 'EOF'
USE_REAL_BEDROCK=true
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=737185589565
NODE_ENV=production
PORT=3000
EOF

# Install PM2 for process management
sudo npm install -g pm2

# Start application
pm2 start src/server.js --name bedrock-sentinel
pm2 startup
pm2 save

# Configure nginx as reverse proxy (optional)
sudo yum install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Update nginx config
sudo tee /etc/nginx/conf.d/bedrock-sentinel.conf > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

sudo nginx -s reload
```

Visit: `http://your-instance-ip:3000`

## Option B: Deploy with Docker

### 1. Build Docker Image

```bash
cd /Users/ashishanand/Desktop/Bedrock-credit/app

# Build
docker build -t bedrock-sentinel:latest .

# Test locally
docker run -d \
  -p 3000:3000 \
  -e USE_REAL_BEDROCK=true \
  -e AWS_REGION=us-east-1 \
  -e AWS_ACCOUNT_ID=737185589565 \
  -v ~/.aws:/root/.aws:ro \
  --name bedrock-test \
  bedrock-sentinel:latest

# Test
curl http://localhost:3000

# Stop
docker stop bedrock-test
```

### 2. Push to ECR

```bash
# Create ECR repository
aws ecr create-repository --repository-name bedrock-sentinel

# Get login token
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 737185589565.dkr.ecr.us-east-1.amazonaws.com

# Tag and push
docker tag bedrock-sentinel:latest \
  737185589565.dkr.ecr.us-east-1.amazonaws.com/bedrock-sentinel:latest

docker push 737185589565.dkr.ecr.us-east-1.amazonaws.com/bedrock-sentinel:latest
```

### 3. Deploy to ECS

```bash
# Create ECS cluster
aws ecs create-cluster --cluster-name bedrock-sentinel

# Create task definition
aws ecs register-task-definition \
  --family bedrock-sentinel \
  --network-mode awsvpc \
  --requires-compatibilities FARGATE \
  --cpu 256 \
  --memory 512 \
  --execution-role-arn arn:aws:iam::737185589565:role/ecsTaskExecutionRole \
  --task-role-arn arn:aws:iam::737185589565:role/BedrockSentinelECSTaskRole \
  --container-definitions '[{
    "name": "bedrock-sentinel",
    "image": "737185589565.dkr.ecr.us-east-1.amazonaws.com/bedrock-sentinel:latest",
    "portMappings": [{
      "containerPort": 3000
    }],
    "environment": [
      {"name": "USE_REAL_BEDROCK", "value": "true"},
      {"name": "AWS_REGION", "value": "us-east-1"},
      {"name": "AWS_ACCOUNT_ID", "value": "737185589565"}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/bedrock-sentinel",
        "awslogs-region": "us-east-1",
        "awslogs-stream-prefix": "ecs"
      }
    }
  }]'

# Create CloudWatch log group
aws logs create-log-group --log-group-name /ecs/bedrock-sentinel

# Create service
aws ecs create-service \
  --cluster bedrock-sentinel \
  --service-name bedrock-sentinel-service \
  --task-definition bedrock-sentinel \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxx],securityGroups=[sg-xxxxx],assignPublicIp=ENABLED}"
```

## Option C: Deploy to Lambda (Serverless)

```bash
# Package for Lambda
zip -r lambda-deployment.zip . -x "node_modules/*" "public/*"

# Create Lambda IAM role
aws iam create-role \
  --role-name BedrockSentinelLambdaRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "lambda.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# Attach policy
aws iam put-role-policy \
  --role-name BedrockSentinelLambdaRole \
  --policy-name BedrockSentinelLambdaPolicy \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": "bedrock:InvokeModel",
        "Resource": "*"
      },
      {
        "Effect": "Allow",
        "Action": [
          "ce:GetCostAndUsage",
          "logs:*"
        ],
        "Resource": "*"
      }
    ]
  }'

# Create Lambda function (note: Lambda has 15-minute timeout, not ideal for long chats)
aws lambda create-function \
  --function-name bedrock-sentinel \
  --runtime nodejs18.x \
  --role arn:aws:iam::737185589565:role/BedrockSentinelLambdaRole \
  --handler src/server.handler \
  --timeout 60 \
  --memory-size 512 \
  --zip-file fileb://lambda-deployment.zip
```

## Step 4: Set Up API Gateway (Optional)

```bash
# Create HTTP API
API_ID=$(aws apigatewayv2 create-api \
  --name bedrock-sentinel-api \
  --protocol-type HTTP \
  --target http://your-instance-ip:3000 \
  --query 'ApiId' \
  --output text)

# Create domain (if you have one)
aws apigatewayv2 create-domain-name \
  --domain-name api.bedrock-sentinel.com \
  --domain-name-configurations DomainNameStatus=AVAILABLE,HostedZoneId=Z35SXDOTRQ7X7K
```

## Step 5: Monitor and Maintain

### View Logs

```bash
# EC2 with PM2
pm2 logs bedrock-sentinel

# ECS
aws logs tail /ecs/bedrock-sentinel --follow

# Lambda
aws logs tail /aws/lambda/bedrock-sentinel --follow
```

### Set Up Alarms

```bash
# Create alarm for high costs
aws cloudwatch put-metric-alarm \
  --alarm-name bedrock-sentinel-high-cost \
  --alarm-description "Alert when Bedrock costs exceed $50 per day" \
  --metric-name UnblendedCost \
  --namespace "AWS/Billing" \
  --statistic Sum \
  --period 86400 \
  --threshold 50 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1
```

## Verify Live Deployment

```bash
# Test dashboard
curl http://your-domain:3000

# Test chat endpoint
curl -X POST http://your-domain:3000/api/bedrock/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is machine learning?"}'

# You should see:
# - Real Claude response (not demonstration)
# - "mode": "live" in the response
# - Actual token counts and costs
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Credentials not found" | Ensure IAM role is attached and has correct permissions |
| "Access Denied" | Verify IAM policy includes `bedrock:InvokeModel` |
| "502 Bad Gateway" | Check security groups allow traffic between Load Balancer and app |
| "Demonstration mode" | Verify `USE_REAL_BEDROCK=true` is set in environment |
| "High latency" | Use larger instance (t3.small or larger) |

## Costs

- **EC2 t3.micro**: ~$5/month (free tier eligible)
- **Bedrock API calls**: Variable (Claude 3.5 Sonnet ~$0.003 per 1K input tokens)
- **CloudWatch monitoring**: ~$0.30/month
- **Cost Explorer**: Free

## Next Steps

1. ✅ Verify real Bedrock connection
2. ⬜ Set up SSL/HTTPS with ACM
3. ⬜ Configure auto-scaling for production
4. ⬜ Set up CloudWatch dashboards
5. ⬜ Enable Multi-Account Access
6. ⬜ Configure quota enforcement

## Support

For deployment issues:
- Check CloudWatch logs
- Verify IAM permissions with `aws iam simulate-custom-policy`
- Test Bedrock access with AWS CLI: `aws bedrock list-foundation-models`
