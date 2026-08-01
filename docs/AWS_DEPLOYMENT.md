# AWS EC2 deployment

This deployment uses one EC2 instance, Amazon ECR, GitHub Actions OIDC, and
Systems Manager Run Command. It does not store an AWS access key or an SSH key
in GitHub.

## 1. Create the AWS stack

In AWS CloudFormation, create a stack from `infra/aws/cloudformation.yml` in
the target region. Select a public subnet in the default VPC and use
`t3.small`. Enter the exact GitHub owner and repository name.
Enter a billing-alert email address as well; the template creates a $10 monthly
budget with actual and forecast notifications. The amount can be changed when
the stack is created.

For a repository created after July 15, 2026, also enter its numeric
`GitHubOwnerId` and `GitHubRepositoryId` so the IAM trust policy matches
GitHub's immutable OIDC subject. After GitHub authentication, obtain them with:

```bash
gh api repos/OWNER/REPOSITORY --jq '.owner.id, .id'
```

Leave `CreateGitHubOidcProvider` set to `true` for a new account. If the account
already has `token.actions.githubusercontent.com` configured in IAM, set it to
`false` and provide that provider ARN.

The stack creates:

- a private ECR repository with image scanning and retention;
- an Amazon Linux 2023 EC2 instance with Docker and Docker Compose;
- a monthly AWS cost budget and email alerts;
- an EC2 role for SSM, ECR pulls, and one Gemini parameter;
- a GitHub OIDC deployment role restricted to this repository's `production`
  environment;
- a security group exposing only HTTP port 80.

## 2. Store the Gemini key

In AWS Systems Manager Parameter Store, create a `SecureString` named:

```text
/touchline-26/prod/gemini-api-key
```

The app still starts with its local recommendation fallback when this parameter
does not exist.

## 3. Configure GitHub

Create a GitHub environment named `production`, set its allowed deployment
branch to `main`, and add these environment variables using the CloudFormation
outputs:

| Variable | Value |
| --- | --- |
| `AWS_ROLE_ARN` | `GitHubRoleArn` output |
| `AWS_REGION` | Stack region, such as `ap-northeast-2` |
| `ECR_REPOSITORY` | `EcrRepositoryName` output |
| `EC2_INSTANCE_ID` | `InstanceId` output |
| `GEMINI_PARAMETER_NAME` | `/touchline-26/prod/gemini-api-key` |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` |

No AWS access-key GitHub secret is required.

## 4. Deploy

Push to `main` or run the `Deploy to AWS EC2` workflow manually. The workflow:

1. installs dependencies and runs the test suite;
2. builds the production Docker image and pushes immutable commit and `latest`
   tags to ECR;
3. synchronizes the production Compose and Nginx configuration through SSM;
4. pulls the exact commit image and waits for both containers to become
   healthy.

Open the CloudFormation `PublicUrl` output after the workflow succeeds.

## Before public launch

Add a domain and TLS through CloudFront or an Application Load Balancer before
using the site for real users. Also configure an AWS Budget and billing alerts;
Free Tier credits are a balance, not an unlimited traffic allowance.
