"use strict";

const game = require("../../game.json");
const common = require("../../helpers/common");
const model = require("../game_life.js");
const policeJSON = require("./data/police.json");

module.exports.doSimulateEncounter = function doSimulateEncounter(life) {
	let newLife = JSON.parse(JSON.stringify(life));
	// see if we even get an event
	const eventRoll = common.getRandomInt(0, game.police.heat_cap);
	// calculate our encounter rate for our location
	const encounterRate = getTotalHeat(newLife);
	// see if our roll is good enough for an encounter
	if (encounterRate <= eventRoll || life.testing === true) {
		// they didn't get an encounter
		newLife.current.police.encounter = null;
		return newLife;
	}
	newLife = module.exports.startEncounter(newLife);
	return newLife;
};

module.exports.startEncounter = function startEncounter(life) {
	let newLife = JSON.parse(JSON.stringify(life));
	const totalHeat = getTotalHeat(life);
	const totalOfficers = Math.ceil(totalHeat / (game.police.heat_cap / game.police.total_officers)) - 1;
	// if we don't need any officers, we don't need an event
	if (totalOfficers === 0) {
		newLife.current.police.encounter = null;
		return newLife;
	}
	const encounter = {
		id: Date.now(),
		officers: totalOfficers,
		total_hp: totalOfficers * game.person.starting_hp,
		mode: "discovery"
	};
	newLife.current.police.encounter = encounter;
	newLife = module.exports.simulateEncounter(newLife);
	// console.log("* startEncounter:", newLife);
	return newLife;
};

module.exports.simulateEncounter = function simulateEncounter(life) {
	const newLife = JSON.parse(JSON.stringify(life));
	// see where we're at in the encounter
	const handleEncounter = {
		// discovery is the phase where the officer is trying to figure out what's going on
		// the officer will ask questions and may ask to search
		discovery: doDiscoveryMode,
		// investigation mode is where you've denied the officer permissions to search and
		// he's seeing if he has probably cause to conduct a search anyway
		investigation: doInvestigationMode,
		// searching is the phase where the officer is actively searching your storage
		// you either consented during discovery, or the officer is claiming probable cause
		searching: doSearchingMode,
		// the officer found something, or caught you shooting at him, or something
		// it's not good, you're about to go to jail
		detained: doDetainedMode,
		// fighting is when you've decided to shoot at the officer and he's now engaged in combat with you
		fighting: doFightingMode,
		// chasing is when you've attempted to flee and the officer is giving chase
		chasing: doChasingMode,
		// and when we're all done...
		end: doEndMode
	};
	// set up the default actions
	const handleActions = {
		// you hiss at the officer, it doesn't usually work in your favor
		hiss: doHissAction,
		// you run from the officer, it sometimes works
		run: doRunAction,
		// you attempt to fight the officer, works, but depends on the situation
		fight: doFightAction
	};
	// set up the default action
	const handleDefaultAction = handleActions[life.current.police.encounter.action];
	// check to see if it's one of the defaults
	if (typeof(handleDefaultAction) !== "undefined") {
		// if it is, let's do that instead of whatever else we were going to do
		return handleDefaultAction(newLife);
	}
	// if they didn't hit a default action, check modes
	return handleEncounter[life.current.police.encounter.mode](newLife);

	function doHissAction(lifeObj) {
		// *** You have just hissed at the officer
		const police = lifeObj.current.police;
		const roll = rollDice(0, 1, police.meta);
		if (roll >= game.police.hiss_success_rate) {
			// they failed the roll, and have enraged the officer
			// TODO: replace this with some kind of check for death, probably a setter
			lifeObj.current.health.points -= game.police.attack_base_damage * 2;
			lifeObj.current.police.encounter.reason = "hiss_failure";
			// change the modes
			lifeObj = changeModes(lifeObj, "fighting");
			return lifeObj;
		}
		// they succeeded with the roll and have been released
		lifeObj.current.police.encounter.reason = "hiss_success";
		// change the modes
		lifeObj = changeModes(lifeObj, "end");
		return lifeObj;
	}

	function doRunAction(lifeObj) {
		// *** You have just ran from the officer

	}

	function doFightAction(lifeObj) {
		// *** You have just attacked the officer

	}

	function doDiscoveryMode(lifeObj) {
		// *** You are getting pulled over
		const police = lifeObj.current.police;
		if (!police.encounter.action) {
			// this is their first encounter in this mode
			return updateEncounter("discovery", ["permit_search", "deny_search"], lifeObj);
		}
		// set up reply actions
		const actionObj  = {
			"permit_search": (actionLifeObj) => {
				// *** You are giving consent for the search
				actionLifeObj.current.police.encounter.reason = "search_consent";
				return changeModes(actionLifeObj, "searching");
			},
			"deny_search": (actionLifeObj) => {
				// *** You are not giving consent for the search
				return changeModes(actionLifeObj, "investigation");
			}
		};
		return actionObj[police.encounter.action](lifeObj);
	}

	function doInvestigationMode(lifeObj) {
		const police = lifeObj.current.police;
		// *** Police are looking around after you refused consent
		if (!police.encounter.action) {
			// this is their first encounter in this mode
			return updateEncounter("investigation", ["admit_guilt", "deny_guilt"], lifeObj);
		}
		// set up reply actions
		const actionObj  = {
			"admit_guilt": (actionLifeObj) => {
				// *** You've admitted that you are guilty of a crime
				if (lifeObj.current.storage.available === lifeObj.current.storage.total) {
					// they aren't carrying anything
					actionLifeObj.current.police.encounter.reason = "crazy_person";
					return changeModes(actionLifeObj, "end");
				}
				actionLifeObj.current.police.encounter.reason = "admit_guilt";
				return changeModes(actionLifeObj, "detained");
			},
			"deny_guilt": (actionLifeObj) => {
				// *** You are denying any wrongdoing
				if (lifeObj.current.storage.available === lifeObj.current.storage.total) {
					// they aren't carrying anything
					actionLifeObj.current.police.encounter.reason = "investigation_failure";
					return changeModes(actionLifeObj, "end");
				}
				// you have SOMETHING, let's roll to see if he sees it
				const roll = rollDice(0, 1, actionLifeObj.current.police.meta);
				// TODO: weight this, more used storage, higher chance of them finding it
				if (roll >= game.police.investigation_proficiency) {
					// they see something suspect (probable cause)
					actionLifeObj.current.police.encounter.reason = "search_probable_cause";
					return changeModes(actionLifeObj, "searching");
				}
				// they don't see anything, so you're free to leave
				actionLifeObj.current.police.encounter.reason = "investigation_failure";
				return changeModes(actionLifeObj, "end");
			}
		};
		return actionObj[police.encounter.action](lifeObj);
	}

	function doSearchingMode(lifeObj) {
		// *** The police are searching your car, either because you let them, or they have PC
		const police = lifeObj.current.police;
		const reason = police.encounter.reason;
		if (!police.encounter.action) {
			// this is their first encounter in this mode
			return updateEncounter(reason, ["comply_search"], lifeObj);
		}
		// set up reply actions
		const actionObj  = {
			"comply_search": (actionLifeObj) => {
				// *** You do not resist the officer during his search
				if (lifeObj.current.storage.available === lifeObj.current.storage.total) {
					// they aren't carrying anything
					lifeObj.current.police.encounter.reason = "search_failure";
					return changeModes(actionLifeObj, "end");
				}
				// roll here to see if they find what you're carrying
				const roll = rollDice(0, 1, lifeObj.current.police.meta);
				// TODO: weight this, more used storage, higher chance of them finding it
				if (roll >= game.police.search_proficiency) {
					// they found your stash...man
					lifeObj.current.police.encounter.reason = "search_successful";
					return changeModes(actionLifeObj, "detained");
				}
				// you somehow didn't get caught
				lifeObj.current.police.encounter.reason = "search_failure";
				return changeModes(actionLifeObj, "end");
			}
		};
		return actionObj[police.encounter.action](lifeObj);
	}

	function doDetainedMode(lifeObj) {
		// *** You are being detained, this is your last chance
		const police = lifeObj.current.police;
		const reason = police.encounter.reason;
		if (!police.encounter.action) {
			// this is their first encounter in this mode
			return updateEncounter(reason, ["comply_detain"], lifeObj);
		}
		// set up reply actions
		const actionObj  = {
			"comply_detain": (actionLifeObj) => {
				// *** You do not resist the officer during his search
				actionLifeObj.current.police.encounter.reason = "comply_detain";
				return changeModes(actionLifeObj, "end");
			}
		};
		return actionObj[police.encounter.action](lifeObj);
	}

	function doFightingMode(lifeObj) {
		// *** You are engaged in violence with the police
		return lifeObj;
	}

	function doChasingMode(lifeObj) {
		// *** You are running and the police are actively pursuing you
		return lifeObj;
	}

	function doEndMode(lifeObj, reason) {
		// *** Tally results and allow player to proceed
		console.log("end mode hit");
		return lifeObj;
	}
};

function getTotalHeat(life) {
	return life.current.police.heat + getAwarenessHeat(life);
}

function getAwarenessHeat(life) {
	// get the heat for the specific country's awareness
	let heat = 0;
	if (life.current.police.awareness[life.current.location.country]) {
		heat += life.current.police.awareness[life.current.location.country];
	}
	return heat;
}

function changeModes(lifeObj, mode) {
	lifeObj.current.police = doChangeModes(lifeObj.current.police, mode);
	return lifeObj;
}

function doChangeModes(police, mode) {
	// get rid of the action if there is one
	delete police.encounter.action;
	// set the mode
	police.encounter.mode = mode;
	return police;
}

function rollDice(min, max, luck) {
	luck = typeof(luck) !== "undefined" ? luck : "none";
	const luckObj = {
		"lucky": min,
		"unlucky": max,
		"none": common.getRandomArbitrary(0, 1)
	};
	return luckObj[luck];
}

function updateEncounter(action, choices, lifeObj) {
	lifeObj.current.police.encounter.message = policeJSON.messages[action];
	lifeObj.current.police.encounter.choices = [
		policeJSON.choices.hiss.id,
		policeJSON.choices.attack.id,
		policeJSON.choices.run.id
	];
	lifeObj.current.police.encounter.choices = lifeObj.current.police.encounter.choices.concat(choices);
	const history = {
		id: lifeObj.current.police.encounter.id,
		encounter: lifeObj.current.police.encounter
	};
	lifeObj.current.police.history.push(history);
	return lifeObj;
}