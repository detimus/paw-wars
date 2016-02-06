$(document).ready(function() {
  try {
    life = JSON.parse(life);
  } catch (e) {
    console.err(e);
  }
  // when the document loads, first thing, refresh the encounter
  refreshEncounter(life);

  $(document).on("click", ".police-choice", function (e) {
    disableAll();
    var selectedChoice = $(e.target).data("id");
    var action = {
      id: life.id,
      action: selectedChoice
    };
    $.ajax({
      type: 'POST', // Use POST with X-HTTP-Method-Override or a straight PUT if appropriate.
      dataType: 'json', // Set datatype - affects Accept header
      url: "/game/police/encounter", // A valid URL
      data: action
    }).done(function(result) {
      if (result.error === false){
        // this means everything worked out great
        life = result.life;
        if (life.current.police.encounter === null) {
          window.location.replace("/game/hotel");
        } else {
          refreshEncounter(life);
        }
      }else{
        displayAlert("warning", "Oh no!  Something has gone wrong (" + result.message + ")");
        enableAll();
      }
    }).fail(function(result) {
      displayAlert("danger", "Oh no!  Something has gone terribly wrong (" + JSON.stringify(result, 2, null) + ")");
      enableAll();
    });
  });
});

function refreshEncounter(lifeObj) {
  updateHUD(lifeObj);
  emptyMessages();
  emptyChoices();
  populateMessage(lifeObj);
  populateChoices(lifeObj);
  enableAll();
}

function populateMessage(lifeObj) {
  var messageFull = "#police-messages-full";
  var messageSimple = "#police-messages-simple";
  // actually replace the messages
  $(messageFull).html(lifeObj.current.police.encounter.message.full);
  $(messageSimple).html(lifeObj.current.police.encounter.message.simple);
}

function populateChoices(lifeObj) {
  var choicesHTML = "";
  var i = 0;
  while (i < lifeObj.current.police.encounter.choices.length) {
    choicesHTML += "<button class='btn list-group-item police-choice' data-id='" + lifeObj.current.police.encounter.choices[i].id + "'>" + lifeObj.current.police.encounter.choices[i].full + "</button>";
    i++;
  }
  $("#police-choices-group").html(choicesHTML);
}

function emptyMessages() {
  $("#police-messages-full").html("");
  $("#police-messages-simple").html("");
}

function emptyChoices() {
  $("#police-choices-group").html("");
}

function disableAll() {
  $("#police-messages-full").addClass("text-muted");
  $("#police-messages-simple").addClass("text-muted");
  $(".police-choice").each(function() {
    $(this).prop("disabled", true);
  });
}

function enableAll() {
  $("#police-messages-full").removeClass("text-muted");
  $("#police-messages-simple").removeClass("text-muted");
  $(".police-choice").each(function() {
    $(this).prop("disabled", false);
  });
}

function displayAlert(type, message){
  alert = '<div class="alert alert-' + type + ' alert-dismissible" role="alert">';
  alert += '<button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>' + message + '</div>';
  $("#alert-container").html(alert);
}

function updateHUD(lifeObj) {
  $("#hud-turn-value").html(lifeObj.current.turn);
  $("#hud-hp-value").html(lifeObj.current.health.points);
  $("#hud-cash-value").html(lifeObj.current.finance.cash);
  $("#hud-savings-value").html(lifeObj.current.finance.savings);
  $("#hud-debt-value").html(lifeObj.current.finance.debt);
  $("#hud-storage-value").html(lifeObj.current.storage.available);
  $("#hud-storage-total-value").html(lifeObj.current.storage.total);
}