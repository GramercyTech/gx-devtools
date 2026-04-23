import React from "react"
import { Box, Text } from "ink"
import { createRequire } from "module"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Navigate up from dist/tui/components to package root
const pkgPath = join(__dirname, "..", "..", "..", "package.json")
const pkg = require(pkgPath)

const LOGO = `
   ██████╗ ██╗  ██╗██████╗
  ██╔════╝ ╚██╗██╔╝██╔══██╗
  ██║  ███╗ ╚███╔╝ ██████╔╝
  ██║   ██║ ██╔██╗ ██╔═══╝
  ╚██████╔╝██╔╝ ██╗██║
   ╚═════╝ ╚═╝  ╚═╝╚═╝
`

interface UpdateInfo {
	currentVersion: string
	latestVersion: string | null
	updateAvailable: boolean
	lastCheckedAt: number | null
}

interface WelcomeScreenProps {
	updateInfo?: UpdateInfo | null
}

export default function WelcomeScreen({ updateInfo }: WelcomeScreenProps = {}) {
	const showUpdateBanner =
		!!updateInfo && updateInfo.updateAvailable && !!updateInfo.latestVersion

	return (
		<Box
			flexDirection="column"
			alignItems="center"
			justifyContent="center"
			flexGrow={1}
			padding={1}
		>
			<Text color="blue">{LOGO}</Text>

			<Box marginTop={1} flexDirection="column" alignItems="center">
				<Text bold color="white">
					GxP DevStudio
				</Text>
				<Text dimColor>v{pkg.version}</Text>
			</Box>

			{showUpdateBanner && updateInfo && (
				<Box
					marginTop={1}
					paddingX={2}
					borderStyle="round"
					borderColor="yellow"
					flexDirection="column"
					alignItems="center"
				>
					<Text>
						<Text color="yellow">📦 </Text>
						<Text bold color="yellow">
							Update available:
						</Text>{" "}
						<Text>{updateInfo.currentVersion}</Text>
						<Text color="gray"> → </Text>
						<Text color="cyan">{updateInfo.latestVersion}</Text>
					</Text>
					<Text color="gray">
						Run <Text color="cyan">npm i -g @gxp-dev/tools</Text> to update
					</Text>
				</Box>
			)}

			<Box marginTop={1}>
				<Text color="gray">
					Interactive development environment for GxP plugins
				</Text>
			</Box>

			<Box marginTop={2} flexDirection="row" justifyContent="center">
				{/* Quick Start Column */}
				<Box flexDirection="column" marginRight={4}>
					<Text color="cyan" bold>
						Quick Start
					</Text>
					<Box marginTop={1} flexDirection="column">
						<Text>
							{" "}
							<Text color="yellow">/dev</Text> Start Vite + Socket.IO
						</Text>
						<Text>
							{" "}
							<Text color="yellow">/dev --no-socket</Text> Start Vite only (no
							Socket)
						</Text>
						<Text>
							{" "}
							<Text color="yellow">/dev --with-mock</Text> Start with Mock API
						</Text>
						<Text>
							{" "}
							<Text color="yellow">/socket</Text> Start Socket.IO server
						</Text>
						<Text>
							{" "}
							<Text color="yellow">/ext chrome</Text> Launch Chrome extension
						</Text>
						<Text>
							{" "}
							<Text color="yellow">/help</Text> Show all commands
						</Text>
					</Box>
				</Box>

				{/* Keyboard Shortcuts Column */}
				<Box flexDirection="column" marginLeft={4}>
					<Text color="cyan" bold>
						Keyboard Shortcuts
					</Text>
					<Box marginTop={1} flexDirection="column">
						<Text>
							{" "}
							<Text color="green">Tab</Text> Cycle through tabs
						</Text>
						<Text>
							{" "}
							<Text color="green">Left/Right</Text> Switch tabs
						</Text>
						<Text>
							{" "}
							<Text color="green">Ctrl+K</Text> Stop current service
						</Text>
						<Text>
							{" "}
							<Text color="green">Ctrl+L</Text> Clear current log
						</Text>
						<Text>
							{" "}
							<Text color="green">Ctrl+C</Text> Exit application
						</Text>
					</Box>
				</Box>
			</Box>

			<Box marginTop={2} flexDirection="column" alignItems="center">
				<Text color="cyan" bold>
					Socket Events
				</Text>
				<Box marginTop={1} flexDirection="column" alignItems="center">
					<Text color="gray">
						Use <Text color="yellow">/socket list</Text> to see available events
					</Text>
					<Text color="gray">
						Use <Text color="yellow">/socket send EventName</Text> to simulate
						events
					</Text>
				</Box>
			</Box>

			<Box marginTop={2} flexDirection="column" alignItems="center">
				<Text color="cyan" bold>
					Browser Extensions
				</Text>
				<Box marginTop={1} flexDirection="column" alignItems="center">
					<Text color="gray">
						Test your plugin on live GxP pages with the browser extension
					</Text>
					<Text color="gray">
						Open DevTools and use the "GxP Inspector" panel to select components
					</Text>
				</Box>
			</Box>

			<Box marginTop={2}>
				<Text dimColor>Type a command below to get started...</Text>
			</Box>
		</Box>
	)
}
