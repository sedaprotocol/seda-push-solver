#!/usr/bin/env node
import { Command } from "@commander-js/extra-typings";
import { version } from "../package.json";
import { runCommand } from "./cli/run";

const program = new Command()
	.description("SEDA Solver CLI")
	.version(version)
	.addHelpText("after", "\r")
	.addCommand(runCommand)
	.helpOption(undefined, "Display this help");

program.parse(process.argv);
