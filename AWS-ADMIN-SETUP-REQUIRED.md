# ⚠️ AWS Administrator Setup Required

Your AWS credentials are configured correctly, but you need **Bedrock permissions** enabled by an AWS Administrator.

## Status Check

```bash
✅ AWS Credentials: WORKING
   User: ashish.anand@redingtongroup.com
   Account: 737185589565
   Region: ap-south-1 (configured)

❌ Bedrock Permissions: MISSING
   Error: Not authorized to perform bedrock:InvokeModel
   Solution: AWS Admin needs to grant permissions

❌ IAM Permissions: MISSING
   Error: Cannot update own IAM policy
   Solution: AWS Admin needs to attach policy
```

---

## What AWS Admin Needs to Do

### Option 1: Attach Existing AWS Managed Policy (Easiest)

An AWS Administrator should run:

```bash
aws iam attach-user-policy \
  --user-name ashish.anand@redingtongroup.com \
  --policy-arn arn:aws:iam::aws:policy/AmazonBedrockFullAccess
```

✅ **Fastest solution** - Gives full Bedrock access

### Option 2: Create Custom Policy (Recommended for Security)

An AWS Administrator should create an inline policy with:

**IAM Console**: Users → ashish.anand@redingtongroup.com → Add Inline Policy → JSON

Paste this:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:ListFoundationModels",
        "bedrock:GetFoundationModel"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ce:GetCostAndUsage",
        "cloudwatch:GetMetricStatistics",
        "sts:AssumeRole"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## Additional Setup (by AWS Admin)

### 1. Enable Bedrock in Your Region

**AWS Console** → Search "Bedrock" → Click "Get Started" or "Enable"

- Accept model access terms for Claude models
- This enables the service in your account

### 2. Check Model Access

**AWS Console** → Amazon Bedrock → Model Access

Ensure these models show "Access granted":
- ✅ Claude 3.5 Sonnet
- ✅ Claude 3 Opus  
- ✅ Claude 3 Haiku

---

## What to Tell Your AWS Administrator

**Email/Message Template:**

> Hi,
> 
> I need Bedrock API access to run a cost governance dashboard. Could you please:
> 
> 1. Attach the `AmazonBedrockFullAccess` managed policy to my IAM user
>    - User: ashish.anand@redingtongroup.com
>    - Or use the custom policy provided in AWS-ADMIN-SETUP-REQUIRED.md
> 
> 2. Ensure Bedrock is enabled in the account:
>    - Go to AWS Console → Amazon Bedrock
>    - Click "Get Started" if not already enabled
>    - Accept terms for Claude models
> 
> 3. Verify model access:
>    - Amazon Bedrock → Model Access
>    - Enable: Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku
> 
> Thanks!

---

## Once Admin Completes Setup

### 1. Verify Permissions

```bash
# After admin attaches policy (may take 1-2 minutes)
aws bedrock list-foundation-models --region us-east-1

# Should show Claude models without errors
```

### 2. Update Application .env

```bash
cd /Users/ashishanand/Desktop/Bedrock-credit/app

# Edit .env
nano .env

# Set:
USE_REAL_BEDROCK=true
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=737185589565
```

### 3. Start Dashboard

```bash
npm install
npm start

# Should output:
# ✅ Using REAL AWS Bedrock client
# Server running on http://localhost:3000
```

### 4. Test Chat

```bash
curl -X POST http://localhost:3000/api/bedrock/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello Claude!"}'

# Should return REAL Claude response with "mode": "live"
```

---

## FAQ

**Q: Why do I need admin approval?**
A: Security - IAM policies control API access. Your user doesn't have permission to modify their own permissions.

**Q: How long does it take?**
A: Usually immediate, but can take 1-2 minutes for IAM permissions to propagate.

**Q: Can I use demo mode while waiting?**
A: Yes! Set `USE_REAL_BEDROCK=false` in .env for demonstration mode.

**Q: What's the difference?**
A: 
- **Real Mode**: Actual Claude responses, real costs, production-ready
- **Demo Mode**: Simulated responses for testing, no actual API calls

---

## Next Steps

1. **Now**: Send AWS admin the setup instructions above
2. **Wait**: 1-2 minutes for IAM permissions to propagate
3. **Then**: Run verification command above
4. **Finally**: Update .env and start the dashboard

---

## Contact

If admin has questions about the policy, refer them to:
- AWS Bedrock Documentation: https://docs.aws.amazon.com/bedrock/
- IAM Policy Examples: https://docs.aws.amazon.com/bedrock/latest/userguide/getting-started.html

---

**Status**: ⏳ Waiting for AWS Admin to grant Bedrock permissions

Once permissions are granted, you can immediately start using real AWS Bedrock with the dashboard.
