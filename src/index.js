const https = require("https")
const http = require("http")
const express = require("express")
const config = require("config")
const bodyParser = require("body-parser")
const fs = require("fs")
const { ECRClient } = require("@aws-sdk/client-ecr")
const k8s = require("@kubernetes/client-node")

const httpsOptions = {
	key: config.server.tls.key || fs.readFileSync(config.server.tls.keyPath),
	cert: config.server.tls.cert || fs.readFileSync(config.server.tls.certPath)
}

const ecrClient = new ECRClient()
const k8sClient = new k8s.KubeConfig()
k8sClient.loadFromCluster()

if (!config.ecr.registry) {
	throw new Error(
		"Missing registry, registry can be configured with ECR_REGISTRY environment variable"
	)
}

if (!config.ecr.repositoryPolicyText) {
	throw new Error(
		"Missing repository policy text, repository policy text can be configured with ECR_REPOSITORY_POLICY_TEXT environment variable"
	)
}

const apiV1 = require("./api/v1")

const app = express()

app.set("ecrClient", ecrClient).set("k8sClient", k8sClient)

app.use(bodyParser.json()).use("/api/v1", apiV1)

app.get("/health", (req, res) => {
	res.status(200).send("OK")
})

https.createServer(httpsOptions, app).listen(config.server.port.https, () => {
	console.log(`Webhook listening on HTTPS port ${config.server.port.https}`)
})

http.createServer(app).listen(config.server.port.http, () => {
	console.log(`Webhook listening on HTTP port ${config.server.port.http}`)
})
