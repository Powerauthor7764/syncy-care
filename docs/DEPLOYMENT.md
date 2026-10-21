# Local and demo hosting

## Local

```bash
node --version    # requires >=22
npm start
# http://127.0.0.1:3000
npm run check
```

Optionally create `.env` from `.env.example` and start with `node --env-file=.env src/server.js`. Avoid placing secrets into source control.

## Docker (optional; image build not tested in this environment)

```bash
docker build -t syncy-care-demo .
docker run --rm -p 3000:3000 syncy-care-demo
```

The Dockerfile binds `HOST=0.0.0.0` inside the container. If hosting anywhere publicly, use this **only as a fictional-data demonstration** and protect it with network access controls. The care-team dashboard and state mutation endpoints have NO authentication.

## Optional DynamoDB

Create a table with String partition key `patientId` and grant appropriate `dynamodb:GetItem` and `dynamodb:PutItem` permissions to your IAM principal. Configure `SYNCY_TABLE`, `AWS_REGION` and valid AWS credentials. The table stores one JSON document per patient, including understanding, questions and audit history. Multi-replica deployments need conditional writes and locking; this demonstration does not implement distributed concurrency guarantees. **Real AWS integration has not been verified.**

## Optional Bedrock

Configure `BEDROCK_MODEL_ID` for an Anthropic Claude model supported by Bedrock in your region, plus `AWS_REGION` and credentials authorized for `bedrock:InvokeModel`. Optional Guardrail headers are configured through `BEDROCK_GUARDRAIL_ID` and `BEDROCK_GUARDRAIL_VERSION`. Only the `simplify_text` tool invokes Bedrock. If the call fails, the previously approved text is returned. **Real AWS model/Guardrail integration has not been verified.**

## MCP connection

The endpoint is `/mcp`. Configure any compatible client for stateless POST JSON-RPC, send `initialize`, then `tools/list`, then `tools/call`. An actual Alexa+ developer connection/deployment and official interoperability run is still required for an Alexa+ submission. No credentials or endpoint have been invented.

## Production restrictions

Never deploy this as a patient-facing clinical service. It lacks authentication and independent safety validation, and it contains only manual synthetic fixtures. See `docs/SAFETY.md`.
