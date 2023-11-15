const config = require("config")
const {
	CreateRepositoryCommand,
	SetRepositoryPolicyCommand
} = require("@aws-sdk/client-ecr")

const registryId = config.ecr.registry.split(".")[0]

const createRepository = async (image, ecrClient) => {
	console.log(
		`Creating repository ${image.targetPath} on ${config.ecr.registry}`
	)
	const createCommand = new CreateRepositoryCommand({
		registryId,
		repositoryName: image.targetPath,
		imageScanningConfiguration: {
			scanOnPush: true
		},
		imageTagMutability: "IMMUTABLE",
		encryptionConfiguration: {
			encryptionType: "KMS"
		},
		tags: [
			{
				Key: "createdBy",
				Value: "image-syncer"
			}
		]
	})

	await ecrClient.send(createCommand)

	const setRepositoryPolicyCommand = new SetRepositoryPolicyCommand({
		registryId,
		repositoryName: image.targetPath,
		policyText: config.ecr.repositoryPolicyText
	})

	await ecrClient.send(setRepositoryPolicyCommand)

	console.log(
		`Done creating repository ${image.targetPath} on ${config.ecr.registry}`
	)
}

const copyRepository = async (image, k8sApi) => {
	const jobName = `image-syncer-${image.targetPath}-${image.tag}`
		.substring(0, 63)
		.replace(/\./g, "-")

	console.log(`Creating copy job ${jobName}`)

	const existingjobs = await k8sApi.listNamespacedJob(config.job.namespace)

	const foundExistingJob = _.find(existingjobs.body.items, {
		name: jobName
	})

	if (foundExistingJob) {
		console.log(`Skipping job creation for ${jobName}, job already found`)
	} else {
		await k8sApi.createNamespacedJob(config.job.namespace, {
			apiVersion: "batch/v1",
			kind: "Job",
			metadata: {
				labels: {
					name: "image-syncer"
				},
				name: jobName,
				namespace: config.job.namespace
			},
			spec: {
				backoffLimit: config.job.backoffLimit,
				completions: config.job.completions,
				parallelism: 1,
				template: {
					metadata: {
						labels: {
							name: "image-syncer",
							"sidecar.istio.io/inject": "false"
						},
						name: jobName
					},
					spec: {
						restartPolicy: "OnFailure",
						imagePullPolicy: "IfNotPresent",
						serviceAccount: config.job.serviceAccountName,
						serviceAccountName: config.job.serviceAccountName,
						containers: [
							{
								name: "create",
								image: config.job.image,
								command: ["/root/script.sh"],
								args: [
									image.imageName,
									config.ecr.registry,
									`${image.targetPath}:${image.tag}`
								]
							}
						]
					}
				}
			}
		})
		console.log(
			`Copy job image-syncer-${image.targetPath}-${image.tag} created`
		)
	}
}

module.exports = { createRepository, copyRepository }
