import * as vscode from 'vscode';
import { Helper } from '../helpers/Helper';
import { ExportFormatsConfiguration, iWorkspaceConfiguration, iUserWorkspaceConfiguration, ThisExtension } from '../ThisExtension';
import { DatabricksConnection } from './DatabricksConnection';
import { DatabricksApiService } from '../databricksApi/databricksApiService';
import { iDatabricksConnection } from './iDatabricksConnection';

export class DatabricksConnectionManager {

	private _workspaceConfig: iWorkspaceConfiguration;
	private _connections: DatabricksConnection[];
	private _activeConnection: DatabricksConnection;

	private _initialized: boolean;

	constructor() {
		this._initialized = false;
		
		this.loadConnections();

		if (this.Connections.length == 0) {
			let msg: string = "No connections have been configured yet! Please add a connection via the VSCode Settings -> Databricks before proceeding!";
			ThisExtension.log(msg);
			vscode.window.showErrorMessage(msg);
		}
		else {
			if (this._workspaceConfig.lastActiveConnection == undefined) {
				this._workspaceConfig.lastActiveConnection = this._connections[0].displayName;
			}
			try {
				this.activateConnection(this._workspaceConfig.lastActiveConnection);
			} catch (error) {
				ThisExtension.log("Could not activate Connection '" + this._workspaceConfig.lastActiveConnection + "' ...");
				ThisExtension.log("Activating first available connection instead ...");
				this.activateConnection(this.Connections[0].displayName);
			}
			
		}
	}

	loadConnections(): void {
		/*
		there are 3 different areas from where Connections can be loaded from:
		1) the VSCode Workspace configuration using a list of connections in setting 'databricks.connections'
		2) the VSCode Workspace configuration using the default connection populated via the GUI. Settings 'databricks.connection.default.*'
		3) the VSCode User/Machine configuration in setting 'databricks.userWorkspaceConfigurations' for the current workspaceGuid

		1) and 2) are used to add new or update existing connections hence they have priority over 3)
		*/

		ThisExtension.log("Getting current Workspace Configuration (databricks.workspaceConfiguration) ...");
		this._workspaceConfig = vscode.workspace.getConfiguration().get('databricks.workspaceConfiguration');

		if (this._workspaceConfig.workspaceGuid == undefined) {
			ThisExtension.log("Creating Workspace Configuration ...");
			this._workspaceConfig.workspaceGuid = Helper.newGuid();
		}

		ThisExtension.log("Loading connections array from Workspace (databricks.connections)...");
		this._connections = this.getConnectionsFromWorkspace();
		ThisExtension.log(`${this._connections.length} connection(s) loaded from Workspace!`);

		ThisExtension.log("Loading default connection from Workspace/UserSettings (databricks.connection.default.*) ...");
		let defaultConnectionFromWorkspace = this.getDefaultConnectionFromWorkspace();
		if(defaultConnectionFromWorkspace)
		{
			ThisExtension.log(`Default connection loaded from Workspace/UserSettings!`);
		}
		else
		{
			ThisExtension.log(`No Default connection found in Workspace/UserSettings!`);
		}

		ThisExtension.log("Loading connections array from UserSetting (databricks.userWorkspaceConfigurations)...");
		let connectionsFromUserConfig = this.getConnectionsFromUserConfig();
		ThisExtension.log(`${connectionsFromUserConfig.length} connection(s) loaded from UserSetting!`);

		if (defaultConnectionFromWorkspace != null && !this._connections.map((x) => x.displayName).includes(defaultConnectionFromWorkspace.displayName)) {
			this._connections.push(defaultConnectionFromWorkspace);
		}

		let newConnectionsFromWorkspace: DatabricksConnection[] = connectionsFromUserConfig.filter((x) => !(this._connections.map((y) => y.displayName).includes(x.displayName)));

		this._connections = this._connections.concat(newConnectionsFromWorkspace);

		this._initialized = true;

		this.updateUserWorkspaceConfig();
	}


	activateConnection(displayName: string): DatabricksConnection {
		let filteredConnections: DatabricksConnection[] = this.Connections.filter((x) => x.displayName == displayName);

		if (filteredConnections.length == 1) {
			this._activeConnection = filteredConnections[0];
			this._workspaceConfig.lastActiveConnection = displayName;

			DatabricksApiService.initialize(this.ActiveConnection);

			this.updateWorkspaceConfig();

			if (this.ActiveConnection.useCodeCells) {
				vscode.workspace.getConfiguration().update("python.dataScience.codeRegularExpression", "^(# COMMAND ----------|#\\s*%%|#\\s*\\<codecell\\>|#\\s*In\\[\\d*?\\]|#\\s*In\\[ \\])", vscode.ConfigurationTarget.Workspace);
			}
			else {
				vscode.workspace.getConfiguration().update("python.dataScience.codeRegularExpression", undefined, vscode.ConfigurationTarget.Workspace);
			}

			return this._activeConnection;
		}
		else {
			let msg = "Connection with name  '" + displayName + "' could not be found!";
			ThisExtension.log(msg)
			throw new Error(msg);
		}
	}

	private getConnectionsFromWorkspace(): DatabricksConnection[] {
		let cons: iDatabricksConnection[] = vscode.workspace.getConfiguration().get('databricks.connections');

		let ret: DatabricksConnection[] = [];

		for (let con of cons) {
			let dbCon = new DatabricksConnection(con);
			if (dbCon.validate()) {
				ret.push(dbCon);
			}
		}

		return ret;
	}

	private getDefaultConnectionFromWorkspace(): DatabricksConnection {

		let con: iDatabricksConnection = {
			displayName: vscode.workspace.getConfiguration().get('databricks.connection.default.displayName'),
			cloudProvider: vscode.workspace.getConfiguration().get('databricks.connection.default.cloudProvider'),
			apiRootUrl: vscode.workspace.getConfiguration().get('databricks.connection.default.apiRootUrl'),
			personalAccessToken: vscode.workspace.getConfiguration().get('databricks.connection.default.personalAccessToken'),
			localSyncFolder: vscode.workspace.getConfiguration().get('databricks.connection.default.localSyncFolder'),

			exportFormats: vscode.workspace.getConfiguration().get<ExportFormatsConfiguration>('databricks.connection.default.exportFormats'),
			useCodeCells: vscode.workspace.getConfiguration().get('databricks.connection.default.useCodeCells')
		};

		let defaultCon: DatabricksConnection = new DatabricksConnection(con);

		if (defaultCon.displayName == "" || !defaultCon.validate()) {
			return null;
		}

		return defaultCon;
	}

	private getConnectionsFromUserConfig(): DatabricksConnection[] {
		let currentUserWorkspaceConfig: iUserWorkspaceConfiguration = this.CurrentUserWorkspaceConfiguration;

		let ret: DatabricksConnection[] = [];

		if (currentUserWorkspaceConfig != undefined) {
			for (let con of currentUserWorkspaceConfig.connections) {
				let dbCon = new DatabricksConnection(con);
				if (dbCon.validate()) {
					ret.push(dbCon);
				}
			}

			return ret;
		}
		else {
			return [];
		}
	}

	

	private cleanConnectionsFromConfig(): void {
		vscode.workspace.getConfiguration().update('databricks.connections', undefined, vscode.ConfigurationTarget.Workspace);
	}

	private cleanDefaultConnectionFromConfig(): void {
		vscode.workspace.getConfiguration().update('databricks.connection.default.displayName', undefined, vscode.ConfigurationTarget.Workspace);
		vscode.workspace.getConfiguration().update('databricks.connection.default.cloudProvider', undefined, vscode.ConfigurationTarget.Workspace);
		vscode.workspace.getConfiguration().update('databricks.connection.default.apiRootUrl', undefined, vscode.ConfigurationTarget.Workspace);
		vscode.workspace.getConfiguration().update('databricks.connection.default.personalAccessToken', undefined, vscode.ConfigurationTarget.Workspace);
		vscode.workspace.getConfiguration().update('databricks.connection.default.localSyncFolder', undefined, vscode.ConfigurationTarget.Workspace);

		vscode.workspace.getConfiguration().update('databricks.connection.default.databricksConnectJars', undefined, vscode.ConfigurationTarget.Workspace);
		vscode.workspace.getConfiguration().update('databricks.connection.default.pythonInterpreter', undefined, vscode.ConfigurationTarget.Workspace);
		vscode.workspace.getConfiguration().update('databricks.connection.default.port', undefined, vscode.ConfigurationTarget.Workspace);
		vscode.workspace.getConfiguration().update('databricks.connection.default.organizationId', undefined, vscode.ConfigurationTarget.Workspace);
		vscode.workspace.getConfiguration().update('databricks.connection.default.exportFormats', undefined, vscode.ConfigurationTarget.Workspace);

		vscode.workspace.getConfiguration().update('databricks.connection.default.useCodeCells', undefined, vscode.ConfigurationTarget.Workspace);
	}

	private updateWorkspaceConfig(): void {
		vscode.workspace.getConfiguration().update('databricks.workspaceConfiguration', this._workspaceConfig, vscode.ConfigurationTarget.Workspace);
	}

	private get CurrentWorkspaceConfiguration(): iUserWorkspaceConfiguration {
		return {
			"workspaceConfig": this._workspaceConfig,
			"connections": this.Connections
		};
	}

	private get AllUserWorkspaceConfigurations(): iUserWorkspaceConfiguration[] {
		let allUserWorkspaceConfigs: iUserWorkspaceConfiguration[] = vscode.workspace.getConfiguration().get('databricks.userWorkspaceConfigurations');

		return allUserWorkspaceConfigs;
	}

	private get CurrentUserWorkspaceConfiguration(): iUserWorkspaceConfiguration {
		let allUserWorkspaceConfigs: iUserWorkspaceConfiguration[] = this.AllUserWorkspaceConfigurations;

		let currentUserWorkspaceConfig: iUserWorkspaceConfiguration[] = allUserWorkspaceConfigs.filter((x) => x.workspaceConfig.workspaceGuid == this._workspaceConfig.workspaceGuid);

		if (currentUserWorkspaceConfig.length == 1) {
			return currentUserWorkspaceConfig[0];
		}
		else if (currentUserWorkspaceConfig.length == 0) {
			return undefined;
		}

		throw new Error("There is an error in your User Workspace Configurations ('databricks.userWorkspaceConfigurations'). Please make sure all 'workspaceGuid' are unique!");
	}

	private updateUserWorkspaceConfig(): void {
		ThisExtension.log("Updating user setting 'databricks.userWorkspaceConfigurations' ...");
		let AllUserWorkspaceConfigurations: iUserWorkspaceConfiguration[] = this.AllUserWorkspaceConfigurations;
		let currentUserWorkspaceConfig: iUserWorkspaceConfiguration = this.CurrentWorkspaceConfiguration;

		let updatedUserWorkspaceConfigs: iUserWorkspaceConfiguration[] = [];

		if (currentUserWorkspaceConfig != undefined) {
			// get the original userWorkspaceConfigs except for the current one basically leaving all others unchanged
			updatedUserWorkspaceConfigs = AllUserWorkspaceConfigurations.filter((x) => x.workspaceConfig.workspaceGuid != this._workspaceConfig.workspaceGuid);
			// append the current/changed WorkspaceConfig
			updatedUserWorkspaceConfigs.push(this.CurrentWorkspaceConfiguration);
		}
		else {
			updatedUserWorkspaceConfigs = AllUserWorkspaceConfigurations;
			updatedUserWorkspaceConfigs.push(currentUserWorkspaceConfig);
		}

		let update = vscode.workspace.getConfiguration().update('databricks.userWorkspaceConfigurations', updatedUserWorkspaceConfigs, vscode.ConfigurationTarget.Global);
		update.then((x) =>
			ThisExtension.log("User setting 'databricks.userWorkspaceConfigurations' was updated!")
		);

		ThisExtension.log("Removing workspace settings 'databricks.*' as they have been persisted in the user settings!");
		this.cleanConnectionsFromConfig();
		this.cleanDefaultConnectionFromConfig();
	}

	get ActiveConnection(): DatabricksConnection {
		return this._activeConnection;
	}

	get ActiveConnectionName(): string {
		return this.ActiveConnection.displayName;
	}

	get Connections(): DatabricksConnection[] {
		while (!this._initialized) { Helper.wait(500); }

		return this._connections;
	}

	static get WorkspaceSubFolder(): string {
		return "Workspace";
	}

	static get ClustersSubFolder(): string {
		return "Clusters";
	}

	static get DatabricksFSSubFolder(): string {
		return "DBFS";
	}

	static get JobsSubFolder(): string {
		return "Jobs";
	}
}