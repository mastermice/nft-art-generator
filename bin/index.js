#!/usr/bin/env node

//TODO
//CHECK FOR TRAILING SLASHES ON ALL INPUTS

//IMPORTS
const chalk = require("chalk")
const boxen = require("boxen")
const ora = require("ora")
const inquirer = require("inquirer")
const fs = require("fs")
const { readFile, writeFile, readdir } = require("fs").promises
const mergeImages = require("merge-images")
const { Image, Canvas } = require("canvas")
const ImageDataURI = require("image-data-uri")

//SETTINGS
const MAX_AMOUNT = 3000
let basePath
let outputPath
let traits
let traitsToSort = []
let order = []
let weights = {}
/**
 * A key-value pair of <traitFileName, traitName>
 */
let names = {}
let weightedTraits = []
let seen = []
let metaData = {}
let config = {
	metaData: {},
	useCustomNames: null,
	deleteDuplicates: null,
	generateMetadata: null,
}
let argv = require("minimist")(process.argv.slice(2))

//DEFINITIONS
const getDirectories = (source) =>
	fs
		.readdirSync(source, { withFileTypes: true })
		.filter((dirent) => dirent.isDirectory())
		.map((dirent) => dirent.name)

const sleep = (seconds) =>
	new Promise((resolve) => setTimeout(resolve, seconds * 1000))

//OPENING
console.log(
	boxen(
		chalk.blue(
			" /$$   /$$ /$$$$$$$$ /$$$$$$$$        /$$$$$$  /$$$$$$$  /$$$$$$$$        /$$$$$$  /$$$$$$$$ /$$   /$$ /$$$$$$$$ /$$$$$$$   /$$$$$$  /$$$$$$$$ /$$$$$$  /$$$$$$$ \n" +
				"| $$$ | $$| $$_____/|__  $$__/       /$$__  $$| $$__  $$|__  $$__/       /$$__  $$| $$_____/| $$$ | $$| $$_____/| $$__  $$ /$$__  $$|__  $$__//$$__  $$| $$__  $$\n" +
				"| $$$$| $$| $$         | $$         | $$  \\ $$| $$  \\ $$   | $$         | $$  \\__/| $$      | $$$$| $$| $$      | $$  \\ $$| $$  \\ $$   | $$  | $$  \\ $$| $$  \\ $$\n" +
				"| $$ $$ $$| $$$$$      | $$         | $$$$$$$$| $$$$$$$/   | $$         | $$ /$$$$| $$$$$   | $$ $$ $$| $$$$$   | $$$$$$$/| $$$$$$$$   | $$  | $$  | $$| $$$$$$$/\n" +
				"| $$  $$$$| $$__/      | $$         | $$__  $$| $$__  $$   | $$         | $$|_  $$| $$__/   | $$  $$$$| $$__/   | $$__  $$| $$__  $$   | $$  | $$  | $$| $$__  $$\n" +
				"| $$\\  $$$| $$         | $$         | $$  | $$| $$  \\ $$   | $$         | $$  \\ $$| $$      | $$\\  $$$| $$      | $$  \\ $$| $$  | $$   | $$  | $$  | $$| $$  \\ $$\n" +
				"| $$ \\  $$| $$         | $$         | $$  | $$| $$  | $$   | $$         |  $$$$$$/| $$$$$$$$| $$ \\  $$| $$$$$$$$| $$  | $$| $$  | $$   | $$  |  $$$$$$/| $$  | $$\n" +
				"|__/  \\__/|__/         |__/         |__/  |__/|__/  |__/   |__/          \\______/ |________/|__/  \\__/|________/|__/  |__/|__/  |__/   |__/   \\______/ |__/  |__/\n \n" +
				"Made with ",
		) +
			chalk.red("❤") +
			chalk.blue(" by NotLuksus"),
		{ borderColor: "red", padding: 3 },
	),
)
main()

async function main() {
	await loadConfig()
	await getBasePath()
	await getOutputPath()
	await checkForDuplicates()
	await generateMetadataPrompt()
	if (config.generateMetadata) {
		await metadataSettings()
	}
	const loadingDirectories = ora("Loading traits")
	loadingDirectories.color = "yellow"
	loadingDirectories.start()
	traits = getDirectories(basePath)
	traitsToSort = [...traits]
	await sleep(2)
	loadingDirectories.succeed()
	loadingDirectories.clear()
	await traitsOrder(true)
	await customNamesPrompt()
	await asyncForEach(traits, async (trait) => {
		await setNames(trait)
	})
	await asyncForEach(traits, async (trait) => {
		await setWeights(trait)
	})
	const generatingImages = ora("Generating images")
	generatingImages.color = "yellow"
	generatingImages.start()
	await generateImages()
	await sleep(2)
	generatingImages.succeed("All images generated!")
	generatingImages.clear()
	if (config.generateMetadata) {
		const writingMetadata = ora("Exporting metadata")
		writingMetadata.color = "yellow"
		writingMetadata.start()
		await writeMetadata()
		await sleep(0.5)
		writingMetadata.succeed("Exported metadata successfully")
		writingMetadata.clear()
	}
	if (argv["save-config"]) {
		const writingConfig = ora("Saving configuration")
		writingConfig.color = "yellow"
		writingConfig.start()
		await writeConfig()
		await sleep(0.5)
		writingConfig.succeed("Saved configuration successfully")
		writingConfig.clear()
	}
}

//GET THE BASEPATH FOR THE IMAGES
async function getBasePath() {
	if (config.basePath !== undefined) {
		basePath = config.basePath
		return
	}
	const { base_path } = await inquirer.prompt([
		{
			type: "list",
			name: "base_path",
			message: "Where are your images located?",
			choices: [
				{ name: "In the current directory", value: 0 },
				{ name: "Somewhere else on my computer", value: 1 },
			],
		},
	])
	if (base_path === 0) {
		basePath = process.cwd() + "/images/"
	} else {
		const { file_location } = await inquirer.prompt([
			{
				type: "input",
				name: "file_location",
				message:
					"Enter the path to your image files (Absolute filepath)",
			},
		])
		let lastChar = file_location.slice(-1)
		if (lastChar === "/") basePath = file_location
		else basePath = file_location + "/"
	}
	config.basePath = basePath
}

//GET THE OUTPUTPATH FOR THE IMAGES
async function getOutputPath() {
	if (config.outputPath !== undefined) {
		outputPath = config.outputPath
		return
	}
	const { output_path } = await inquirer.prompt([
		{
			type: "list",
			name: "output_path",
			message: "Where should the generated images be exported?",
			choices: [
				{ name: "In the current directory", value: 0 },
				{ name: "Somewhere else on my computer", value: 1 },
			],
		},
	])
	if (output_path === 0) {
		outputPath = process.cwd() + "/output/"
	} else {
		const { file_location } = await inquirer.prompt([
			{
				type: "input",
				name: "file_location",
				message:
					"Enter the path to your output_old directory (Absolute filepath)",
			},
		])
		let lastChar = file_location.slice(-1)
		if (lastChar === "/") outputPath = file_location
		else outputPath = file_location + "/"
	}
	config.outputPath = outputPath
}

async function checkForDuplicates() {
	if (config.deleteDuplicates !== null) return
	let { checkDuplicates } = await inquirer.prompt([
		{
			type: "confirm",
			name: "checkDuplicates",
			message:
				"Should duplicated images be deleted? (Might result in less images then expected)",
		},
	])
	config.deleteDuplicates = checkDuplicates
}

async function generateMetadataPrompt() {
	if (config.generateMetadata !== null) return
	let { createMetadata } = await inquirer.prompt([
		{
			type: "confirm",
			name: "createMetadata",
			message: "Should metadata be generated?",
		},
	])
	config.generateMetadata = createMetadata
}

async function metadataSettings() {
	if (Object.keys(config.metaData).length !== 0) return
	let responses = await inquirer.prompt([
		{
			type: "input",
			name: "metadataName",
			message: "What should be the name? (Generated format is NAME#ID)",
		},
		{
			type: "input",
			name: "metadataDescription",
			message: "What should be the description?",
		},
		{
			type: "input",
			name: "metadataImageUrl",
			message:
				"What should be the image url? (Generated format is URL/ID)",
		},
		{
			type: "confirm",
			name: "splitFiles",
			message: "Should JSON metadata be split in multiple files?",
		},
	])
	config.metaData.name = responses.metadataName
	config.metaData.description = responses.metadataDescription
	config.metaData.splitFiles = responses.splitFiles
	let lastChar = responses.metadataImageUrl.slice(-1)
	if (lastChar === "/") config.imageUrl = responses.metadataImageUrl
	else config.imageUrl = responses.metadataImageUrl + "/"
}

//SELECT THE ORDER IN WHICH THE TRAITS SHOULD BE COMPOSITED
async function traitsOrder(isFirst) {
	if (config.order && config.order.length === traits.length) {
		order = config.order
		return
	}
	const traitsPrompt = {
		type: "list",
		name: "selected",
		choices: [],
	}
	traitsPrompt.message = "Which trait should be on top of that?"
	if (isFirst === true)
		traitsPrompt.message = "Which trait is the background?"
	traitsToSort.forEach((trait) => {
		const globalIndex = traits.indexOf(trait)
		traitsPrompt.choices.push({
			name: trait.toUpperCase(),
			value: globalIndex,
		})
	})
	const { selected } = await inquirer.prompt(traitsPrompt)
	order.push(selected)
	config.order = order
	let localIndex = traitsToSort.indexOf(traits[selected])
	traitsToSort.splice(localIndex, 1)
	if (order.length === traits.length) return
	await traitsOrder(false)
}

//SELECT IF WE WANT TO SET CUSTOM NAMES FOR EVERY TRAITS OR USE FILENAMES
async function customNamesPrompt() {
	if (config.useCustomNames !== null) return
	let { useCustomNames } = await inquirer.prompt([
		{
			type: "list",
			name: "useCustomNames",
			message: "How should be constructed the names of the traits?",
			choices: [
				{ name: "Use filenames as traits names", value: 0 },
				{ name: "Choose custom names for each trait", value: 1 },
			],
		},
	])
	config.useCustomNames = useCustomNames
}

//SET NAMES FOR EVERY TRAIT
async function setNames(trait) {
	if (config.useCustomNames) {
		names = config.names || names
		const files = await getFilesForTrait(trait)
		const namePrompt = []
		files.forEach((file, i) => {
			if (config.names && config.names[file] !== undefined) return
			namePrompt.push({
				type: "input",
				name: trait + "_name_" + i,
				message:
					"What should be the name of the trait shown in " +
					file +
					"?",
			})
		})
		const selectedNames = await inquirer.prompt(namePrompt)
		files.forEach((file, i) => {
			if (config.names && config.names[file] !== undefined) return
			names[file] = selectedNames[trait + "_name_" + i]
		})
		config.names = { ...config.names, ...names }
	} else {
		const filenames = fs.readdirSync(basePath + "/" + trait)
		const pngFileNames = filenames.filter((file) => file.endsWith(".png"))

		pngFileNames.forEach((fileName, _i) => {
			names[fileName] = fileName.split(".")[0]
		})
	}
}

//SET WEIGHTS FOR EVERY TRAIT
async function setWeights(trait) {
	console.info(`*** ${trait} ***`)
	// const traitFileNames = Object.keys(names)

	const traitNames = Object.values(names)
	const weightsConfig = config?.weights ?? {}

	const hasConfig = !!config.weights
	const numberOfNames = traitNames.length
	const numberOfWeights = Object.keys(weightsConfig).length

	// traits from both files + weights
	const traits = Array.from(
		new Set([...traitNames, ...Object.keys(weightsConfig)]),
	)

	if (hasConfig && numberOfWeights === numberOfNames) weights = config.weights
	else {
		// Handle misconfiguration
		if (hasConfig) {
			const missingTraitWeights = Object.values(names)
				.map((traitName) => {
					const hasWeightConfig =
						Object.keys(weightsConfig).includes(traitName)

					return !hasWeightConfig ? traitName : null
				})
				.filter(Boolean)

			const missingTraitFiles = Object.keys(weightsConfig).filter(
				(traitName) => {
					const hasTraitFile = traitNames.includes(traitName)

					return !hasTraitFile
				},
			)

			const configurationMatrix = traits.map((trait) => {
				const hasWeight = Object.keys(weightsConfig).includes(trait)
				const hasFile = traitNames.includes(trait)

				return {
					trait,
					hasFile,
					hasWeight,
				}
			})
			const inValidConfigurationMatrix = configurationMatrix.filter(
				({ hasFile, hasWeight }) => {
					const isValid = hasFile && hasWeight

					return !isValid
				},
			)

			// Print error and exit
			console.warn({
				category: trait,
				hasConfig,
				isCorrectConfig: false,
				numberOfTraits: traits.length,
				numberOfWeights,
				numberOfNames,
				missingTraitFiles,
				missingTraitWeights,
			})
			console.table(
				inValidConfigurationMatrix.map(
					({ trait, hasFile, hasWeight }) => {
						return {
							trait,
							hasFile: hasFile ? "✅" : "❌",
							hasWeight: hasWeight ? "✅" : "❌",
						}
					},
				),
				["trait", "hasFile", "hasWeight"],
			)
			console.error(`Incorrect config! Please fix your config.json file.`)
			//	process.exit(1)
		}

		const fileNames = await getFilesForTrait(trait)
		let missingWeightTraitNames = []

		const weightPrompt = []
		fileNames.forEach((fileName, _i) => {
			const traitName = fileName?.replace(".png", "") ?? ""
			const configWeight = weightsConfig[traitName]
			const hasConfigWeight = configWeight !== undefined

			if (!hasConfigWeight) {
				missingWeightTraitNames.push(traitName)
				weightPrompt.push({
					type: "input",
					name: names[fileName] + "_weight",
					message:
						trait +
						": How many " +
						names[fileName] +
						" should there be?",
					default: configWeight ?? 0, //parseInt(Math.round(MAX_AMOUNT / files.length)),
				})
			}
		})

		// Get manual user input
		const userEnteredWeights = await inquirer.prompt(weightPrompt)
		missingWeightTraitNames.forEach((fileName, i) => {
			weights[fileName] = userEnteredWeights[i]
		})

		config.weights = weights
	}
}

//ASYNC FOREACH
async function asyncForEach(array, callback) {
	for (let index = 0; index < array.length; index++) {
		await callback(array[index], index, array)
	}
}

//GENERATE WEIGHTED TRAITS
async function generateWeightedTraits() {
	for (const trait of traits) {
		const traitWeights = []
		const files = await getFilesForTrait(trait)
		files.forEach((file) => {
			for (let i = 0; i < weights[file]; i++) {
				traitWeights.push(file)
			}
		})
		weightedTraits.push(traitWeights)
	}
}

//GENARATE IMAGES
async function generateImages() {
	let noMoreMatches = 0
	let images = []
	let id = 0
	await generateWeightedTraits()
	if (config.deleteDuplicates) {
		while (
			!Object.values(weightedTraits).filter((arr) => arr.length == 0)
				.length &&
			noMoreMatches < 20000
		) {
			let picked = []
			order.forEach((id) => {
				let pickedImgId = pickRandom(weightedTraits[id])
				picked.push(pickedImgId)
				let pickedImg = weightedTraits[id][pickedImgId]
				images.push(basePath + traits[id] + "/" + pickedImg)
			})

			if (existCombination(images)) {
				noMoreMatches++
				images = []
			} else {
				generateMetadataObject(id, images)
				noMoreMatches = 0
				order.forEach((id, i) => {
					remove(weightedTraits[id], picked[i])
				})
				seen.push(images)
				const b64 = await mergeImages(images, {
					Canvas: Canvas,
					Image: Image,
				})
				await ImageDataURI.outputFile(b64, outputPath + `${id}.png`)
				images = []
				id++
			}
		}
	} else {
		while (
			!Object.values(weightedTraits).filter((arr) => arr.length == 0)
				.length
		) {
			order.forEach((id) => {
				images.push(
					basePath +
						traits[id] +
						"/" +
						pickRandomAndRemove(weightedTraits[id]),
				)
			})
			generateMetadataObject(id, images)
			const b64 = await mergeImages(images, {
				Canvas: Canvas,
				Image: Image,
			})
			await ImageDataURI.outputFile(b64, outputPath + `${id}.png`)
			images = []
			id++
		}
	}
}

//GENERATES RANDOM NUMBER BETWEEN A MAX AND A MIN VALUE
function randomNumber(min, max) {
	return Math.round(Math.random() * (max - min) + min)
}

//PICKS A RANDOM INDEX INSIDE AN ARRAY RETURNS IT AND THEN REMOVES IT
function pickRandomAndRemove(array) {
	const toPick = randomNumber(0, array.length - 1)
	const pick = array[toPick]
	array.splice(toPick, 1)
	return pick
}

//PICKS A RANDOM INDEX INSIDE AND ARRAY RETURNS IT
function pickRandom(array) {
	return randomNumber(0, array.length - 1)
}

function remove(array, toPick) {
	array.splice(toPick, 1)
}

function existCombination(contains) {
	let exists = false
	seen.forEach((array) => {
		let isEqual =
			array.length === contains.length &&
			array.every((value, index) => value === contains[index])
		if (isEqual) exists = true
	})
	return exists
}

function generateMetadataObject(id, images) {
	metaData[id] = {
		name: config.metaData.name + "#" + id,
		description: config.metaData.description,
		image: config.imageUrl + id,
		attributes: [],
	}
	images.forEach((image, i) => {
		let pathArray = image.split("/")
		let fileToMap = pathArray[pathArray.length - 1]
		metaData[id].attributes.push({
			trait_type: traits[order[i]],
			value: names[fileToMap],
		})
	})
}

async function writeMetadata() {
	if (config.metaData.splitFiles) {
		let metadata_output_dir = outputPath + "metadata/"
		if (!fs.existsSync(metadata_output_dir)) {
			fs.mkdirSync(metadata_output_dir, { recursive: true })
		}
		for (var key in metaData) {
			await writeFile(
				metadata_output_dir + key,
				JSON.stringify(metaData[key]),
			)
		}
	} else {
		await writeFile(outputPath + "metadata.json", JSON.stringify(metaData))
	}
}

const fixConfig = (config) => {
	const { weights } = config
	return {
		...config,
		weights: Object.entries(weights).reduce((weights, [trait, weight]) => {
			return {
				...weights,
				[trait]: parseInt(weight),
			}
		}, {}),
	}
}

async function loadConfig() {
	try {
		const data = await readFile("config.json")
		const rawConfig = JSON.parse(data.toString())

		const fixedConfig = fixConfig(rawConfig)
		config = fixedConfig
	} catch (error) {}
}

async function writeConfig() {
	await writeFile("config.json", JSON.stringify(config, null, 2))
}

async function getFilesForTrait(trait) {
	return (await readdir(basePath + "/" + trait)).filter(
		(file) => file !== ".DS_Store",
	)
}
