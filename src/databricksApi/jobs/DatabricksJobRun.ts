import * as vscode from 'vscode';
import * as fspath from 'path';
import { DatabricksApiService } from '../databricksApiService';
import { ThisExtension } from '../../ThisExtension';
import { JobTreeItemType, iDatabricksJobRun } from './_types';
import { iDatabricksJob } from './_types';
import { Helper } from '../../helpers/Helper';
import { DatabricksJobTreeItem } from './DatabricksJobTreeItem';

// https://vshaxe.github.io/vscode-extern/vscode/TreeItem.html
export class DatabricksJobRun extends DatabricksJobTreeItem {

	constructor(
		definition: iDatabricksJobRun
	) {
		super("JOB_RUN", definition.run_id, definition.run_name, definition, vscode.TreeItemCollapsibleState.None);

		super.label = "Run " + this.name;
		super.iconPath = {
			light: this.getIconPath("light"),
			dark: this.getIconPath("dark")
		};
	}

	get tooltip(): string {
		let tooltip: string = this.task_details;

		let startDate = new Date(this.definition.start_time);
		
		tooltip = tooltip + "Started: " + Helper.trimChar(startDate.toISOString().split('T')[1], "T") + " UTC\n";

		if(this.state == "succeeded")
		{
			let endDate = new Date(this.definition.start_time + this.definition.setup_duration + this.definition.execution_duration + this.definition.cleanup_duration);
			tooltip = tooltip + "Finished: " + Helper.trimChar(endDate.toISOString().split('T')[1], "T") + " UTC\n";
			tooltip = tooltip + `Duration: ${(endDate.getTime() - startDate.getTime()) / 1000} seconds\n`; 
		}
		else
		{
			tooltip = tooltip + `Duration: ${(Date.now() - startDate.getTime()) / 1000} seconds (running)\n`; 
		}
		
		return tooltip;
	}

	// description is show next to the label
	get description(): string {
		let state = this.definition.state;
		return `(${state.result_state ||state.life_cycle_state}) ${this.definition.run_type} - ${this.task_description}`;
	}

	// used in package.json to filter commands via viewItem == CANSTART
	get contextValue(): string {
		if (this.state == "running") {
			return "RUNNING_JOB";
		}
		return this.type;
	}

	protected getIconPath(theme: string): string {
		let state: string = this.state;

		return fspath.join(ThisExtension.rootPath, 'resources', theme, state + '.png');
	}

	readonly command = {
		command: 'databricksJobItem.click', title: "Open File", arguments: [this]
	};



	get job_id(): number {
		return this.definition.job_id;
	}

	get job_run_id(): number {
		return this.definition.run_id;
	}

	get definition(): iDatabricksJobRun {
		return this._definition as iDatabricksJobRun;
	}

	get state(): string {
		if (this.definition.state.result_state == "SUCCESS") {
			return "succeeded";
		}
		else if (this.definition.state.result_state == "FAILED"
			|| this.definition.state.result_state == "CANCELED"
			|| this.definition.state.result_state == "TIMEDOUT") {
			return "failed";
		}
		else {
			return "running";
		}
	}

	get start_time(): number {
		return this.definition.start_time;
	}

	get link(): string {
		return this.definition.run_page_url;
	}

	get task_type(): string {
		if (this.definition.task.notebook_task) { return "Notebook"; }
		if (this.definition.task.spark_jar_task) { return "JAR"; }
		if (this.definition.task.spark_python_task) { return "Python"; }
		if (this.definition.task.spark_submit_task) { return "Submit"; }
	}

	get task_description(): string {
		if (this.definition.task.notebook_task) { 
			return "Notebook: " + this.definition.task.notebook_task.notebook_path;
		}
		if (this.definition.task.spark_jar_task) { 
			return "JAR: " + this.definition.task.spark_jar_task.jar_uri + " - " + this.definition.task.spark_jar_task.main_class_name;
		}
		if (this.definition.task.spark_python_task) { 
			return "Python: " + this.definition.task.spark_python_task.python_file;
		}
		if (this.definition.task.spark_submit_task) { 
			return "Spark-Submit: " + this.definition.task.spark_submit_task.parameters.join(' '); 
		}
	}

	get task_details(): string {
		if (this.definition.task.notebook_task) { 
			return `Notebook: ${this.definition.task.notebook_task.notebook_path}\nRevision Timestamp: ${this.definition.task.notebook_task.revision_timestamp}\nParameters: ${JSON.stringify(this.definition.task.notebook_task.base_parameters)}`;
		}
		if (this.definition.task.spark_jar_task) { 
			return `JAR: ${this.definition.task.spark_jar_task.jar_uri}\nMain Class: ${this.definition.task.spark_jar_task.main_class_name}\nParameters: ${this.definition.task.spark_jar_task.parameters.join(' ')}`;
		}
		if (this.definition.task.spark_python_task) { 
			return `Python: ${this.definition.task.spark_python_task.python_file}\nParameters: ${this.definition.task.spark_python_task.parameters.join(' ')}`;
		}
		if (this.definition.task.spark_submit_task) { 
			return "Spark-Submit: " + this.definition.task.spark_submit_task.parameters.join(' '); 
		}
	}

	
	public static fromInterface(item: iDatabricksJobRun): DatabricksJobRun {
		return new DatabricksJobRun(item);
	}

	public static fromJSON(itemDefinition: string): DatabricksJobRun {
		let item: iDatabricksJobRun = JSON.parse(itemDefinition);
		let ret = DatabricksJobRun.fromInterface(item);
		return ret;
	}

	async stop(): Promise<void> {
		let response = DatabricksApiService.cancelJunJob(this.job_run_id);

		response.then((response) => {
			vscode.window.showInformationMessage(`Stopping job run ${this.label} (${this.job_run_id}) ...`);
		}, (error) => {
			vscode.window.showErrorMessage(`ERROR: ${error}`);
		});

		await Helper.wait(10000);
		vscode.commands.executeCommand("databricksJobs.refresh", false);
	}
}