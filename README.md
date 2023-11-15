# Privatize

[![blackbird-logo](https://raw.githubusercontent.com/blackbird-cloud/terraform-module-template/main/.config/logo_simple.png)](https://www.blackbird.cloud)

## TLDR;

Kubernetes mutating webhook to copy public Docker images to AWS ECR registry for scanning purposes. Works by listening to pod startup via kubernetes webhook and spins up a job to copy image from public repository (docker.io/gcr.io/etc) to private ECR registry then update pod image to private image.

## How does it works?

Privatize works by listening to kubernetes webhook for all pod creation and update event. Once the webhook triggers it scan through all images in the pod and detect public images. If there are one or more public images it spin up kubernetes job to copy images from the public registry to private ECR registry. Once the job is spun up the target pod public images are replaced by newly created private image.

## Configuration

| environment                     | description                                                      | default                           |
|---------------------------------|------------------------------------------------------------------|-----------------------------------|
| SERVER_HTTP_PORT                | HTTPS port for server                                            | 80                                |
| SERVER_HTTPS_PORT               | HTTP port for server                                             | 443                               |
| SERVER_TLS_KEY_PATH             | Server TLS key path, ignored whe SERVER_TLS_KEY is set           | ./meta/certs/key.pem              |
| SERVER_TLS_CERT_PATH            | Server TLS certificate path, ignored whe SERVER_TLS_CERT is set  | ./meta/certs/cert.pem             |
| SERVER_TLS_KEY                  | Server TLS key string                                            | null                              |
| SERVER_TLS_CERT                 | Server TLS certificate string                                    | null                              |
| COPY_JOB_NAMESPACE              | Namespace where copy job will be spin up                         | privatize                         |
| COPY_JOB_IMAGE                  | Copy job image name                                              | blackbirdcloud/image-syncer:0.0.1 |
| COPY_JOB_SERVICE_ACCOUNT_NAME   | Copy job service account name                                    | privatize                         |
| COPY_JOB_BACKOFF_LIMIT          | Copy job backoff limit                                           | 1                                 |
| COPY_JOB_COMPLETION             | Copy job completion                                              | 2                                 |
| ECR_REGISTRY                    | Target ECR Registry address (required)                           | null                              |
| ECR_REPOSITORY_POLICY_TEXT      | ECR Repository policy document (required)                        | null                              |

## TLS

Kubernetes requires TLS for webhook server, this repo includes self signed certificate for development purpose. TLS certificate can be mounted as files with `SERVER_TLS_KEY_PATH` and `SERVER_TLS_CERT_PATH` env variable or directly without files via `SERVER_TLS_KEY` and `SERVER_TLS_CERT` env variable. TLS certificate must be valid for `<svc_name>.<svc_namespace>.svc`


## Helm deploy

Helm chart for to deploy this service is available on `./charts/privatize`

## Caveat

* Use blackbirdcloud/image-syncer to sync itself to your private ECR repo to prevent infinite loop of job creation due to image-syncer being public.

* There is a racing condition between webhook response and copy image job which can result in image pull backoff event on pod. It's caused by job not done before the webhook response, this error will go away by itself when job is finished.

## Sample K8s Mutating Webhook

```yaml
apiVersion: admissionregistration.k8s.io/v1
kind: MutatingWebhookConfiguration
metadata:
  name: privatize
  resourceVersion: "57397"
  uid: 16217d0e-491b-42f2-b728-43a5e257a867
webhooks:
- admissionReviewVersions:
  - v1beta1
  clientConfig:
    service:
      namespace: privatize
      name: privatize
    caBundle: CA_BUNDLE
  failurePolicy: Ignore
  matchPolicy: Equivalent
  name: privatize
  namespaceSelector: {}
  objectSelector: {}
  reinvocationPolicy: IfNeeded
  rules:
  - apiGroups:
    - ""
    apiVersions:
    - v1
    operations:
    - CREATE
    resources:
    - pods
    scope: '*'
  sideEffects: None
  timeoutSeconds: 10

```

## Sample ECR Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PrivateReadOnly",
      "Effect": "Allow",
      "Principal": {
        "AWS": [
          "arn:aws:iam::xxxxx:root",
          "arn:aws:iam::xxxxx:role/image-syncer"
        ]
      },
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:BatchGetImage",
        "ecr:DescribeImageScanFindings",
        "ecr:DescribeImages",
        "ecr:DescribeRepositories",
        "ecr:GetAuthorizationToken",
        "ecr:GetDownloadUrlForLayer",
        "ecr:GetLifecyclePolicy",
        "ecr:GetLifecyclePolicyPreview",
        "ecr:GetRepositoryPolicy",
        "ecr:ListImages",
        "ecr:ListTagsForResource"
      ]
    },
    {
      "Sid": "ReadWrite",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::xxxxxx:role/image-syncer"
      },
      "Action": [
        "ecr:CompleteLayerUpload",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart"
      ]
    }
  ]
}
```

## About

We are [Blackbird Cloud](https://blackbird.cloud), Amsterdam based cloud consultancy, and cloud management service provider. We help companies build secure, cost efficient, and scale-able solutions.

Checkout our :point\_right: [terraform modules](https://registry.terraform.io/namespaces/blackbird-cloud)

## Copyright

Copyright © 2017-2023 [Blackbird Cloud](https://www.blackbird.cloud)