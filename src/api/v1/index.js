const { Buffer } = require("buffer")
const _ = require("lodash")
const async = require("async")
const config = require("config")
const dockerNameParser = require("parse-docker-image-name")
const { Router } = require("express")
const debug = require("debug")("app:v1")
const k8s = require("@kubernetes/client-node")
const {
	RepositoryNotFoundException,
	DescribeImagesCommand,
	ImageNotFoundException
} = require("@aws-sdk/client-ecr")

const { createRepository, copyRepository } = require("./lib")

const apiV1Route = Router()

const registryId = config.ecr.registry.split(".")[0]

apiV1Route.post("/mutate", async (req, res) => {
	const ecrClient = req.app.get("ecrClient")
	const k8sClient = req.app.get("k8sClient")

	const k8sApi = k8sClient.makeApiClient(k8s.BatchV1Api)

	const admissionReview = req.body
	debug("got admission review", admissionReview)

	if (admissionReview.request?.kind?.kind !== "Pod") {
		throw new Error(
			`Error: Admission controller only accept Pod as resource, got kind: ${admissionReview.request?.kind?.kind}`
		)
	}

	const containers = admissionReview.request.object.spec.containers

	const images = _.map(containers, (container, index) => {
		const image = dockerNameParser(container.image)
		if (!image.tag || image.tag === "latest") {
			throw new Error("Images without tag or latest tag are not allowed")
		}

		const isPublic = image.domain !== config.ecr.registry

		image.targetPath = image.path.replace(/\//g, "-")

		return { ...image, isPublic, index, imageName: container.image }
	})

	debug("images: ", images)

	const publicImages = _.filter(images, { isPublic: true })

	console.log(`found ${publicImages.length} publicImages`)

	await async.eachSeries(publicImages, async (image) => {
		debug(`handling ${image.imageName}`)

		const command = new DescribeImagesCommand({
			registryId,
			repositoryName: image.targetPath,
			imageIds: [{ imageTag: image.tag }]
		})

		let shouldCreateRepository = false
		let shouldCopyImage = false
		try {
			await ecrClient.send(command)
		} catch (error) {
			if (error instanceof RepositoryNotFoundException) {
				shouldCreateRepository = true
				shouldCopyImage = true
			} else if (error instanceof ImageNotFoundException) {
				shouldCreateRepository = false
				shouldCopyImage = true
			} else {
				throw error
			}
		}

		if (shouldCreateRepository) await createRepository(image, ecrClient)

		if (shouldCopyImage) await copyRepository(image, k8sApi)

		console.log(`done handling ${image.imageName}`)
	})

	const jsonPatch = _.chain(images)
		.filter({ isPublic: true })
		.map((image) => ({
			op: "replace",
			path: `/spec/containers/${image.index}/image`,
			value: `${config.ecr.registry}/${image.targetPath}:${image.tag}`
		}))
		.value()

	res.status(200).json({
		kind: req.body.kind,
		apiVersion: req.body.apiVersion,
		request: req.body.request,
		response: {
			uid: req.body.request.uid,
			allowed: true,
			patch: Buffer.from(JSON.stringify(jsonPatch)).toString("base64"),
			patchType: "JSONPatch"
		}
	})
})

module.exports = apiV1Route
