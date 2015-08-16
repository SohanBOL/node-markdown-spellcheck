import program from 'commander';
import fs from 'fs';
import path from 'path';
import glob from 'glob';
import context from './context';
import markdownSpellcheck from "./index";
import generateSummary from './summary-generator';
import inquirer from 'inquirer';
import async from'async'
import chalk from 'chalk';

const packageConfig = fs.readFileSync(path.join(__dirname, '../package.json'));
const buildVersion = JSON.parse(packageConfig).version;

program
  .version(buildVersion)
  // default cli behaviour will be an interactive walkthrough each error, with suggestions,
  // options to replace etc.
  .option('-s, --summary', 'Outputs a summary report which details the unique spelling errors found.')
  .option('-r, --report', 'Outputs a full report which details the unique spelling errors found.')
//  .option('-n, --ignore-numbers', 'Ignores numbers.')
//  .option('-d, --dictionary', 'Ignores numbers.')
  .option('-a, --ignore-acronyms', 'Ignores acronyms.')
  .usage("[options] source-file source-file");

const ACTION_IGNORE = "ignore",
  ACTION_FILE_IGNORE = "fileignore",
  ACTION_ADD = "add",
  ACTION_CORRECT = "enter";

const CHOICE_IGNORE =  { key: "i", name: "Ignore", value: ACTION_IGNORE},
  CHOICE_FILE_IGNORE = { key: "f", name: "Add to file ignores", value: ACTION_FILE_IGNORE},
  CHOICE_ADD = { key: "a", name: "Add to dictionary", value: ACTION_ADD},
  CHOICE_CORRECT = { key: "e", name: "Enter correct spelling", value: ACTION_CORRECT};

function incorrectWordChoices(word, message, done) {
  const suggestions = markdownSpellcheck.spellcheck.suggest(word);

  var choices = [
    CHOICE_IGNORE,
    CHOICE_FILE_IGNORE,
    CHOICE_ADD,
    CHOICE_CORRECT
  ];

  suggestions.forEach((suggestion, index) => {
    choices.push({
      key: index,
      name: suggestion,
      value: index.toString()
    });
  });

  inquirer.prompt([{
    type: "list",
    name: "action",
    message: message,
    choices,
    default: "enter"
  }], function (answer) {
    switch(answer.action) {
      case ACTION_ADD:
        markdownSpellcheck.spellcheck.addWord(word);
        // todo save to dictionary
        done();
        break;
      case ACTION_CORRECT:
        getCorrectWord(word, done);
        break;
      case ACTION_FILE_IGNORE:
        markdownSpellcheck.spellcheck.addWord(word);
        // todo only ignore this file
        done();
        break;
      case ACTION_IGNORE:
        markdownSpellcheck.spellcheck.addWord(word);
        done();
        break;
      default:
        done(suggestions[Number(answer.action)]);
        break;
    }
  });
}

function getCorrectWord(word, done) {
  inquirer.prompt([{
    type: "input",
    name: "word",
    message: "correct word >",
    default: word
  }], function(answer) {
    const newWord = answer.word;
    if (markdownSpellcheck.spellcheck.checkWord(newWord)) {
      done(newWord);
    } else {
      incorrectWordChoices(newWord, "Corrected word is not in dictionary..", done);
    }
  });
}

function spellAndFixFile(file, options, onFinishedFile) {
  let src = fs.readFileSync(file, 'utf-8');

  function onSpellingMistake(wordInfo, done) {
    var displayBlock = context.getBlock(src, wordInfo.index, wordInfo.word.length);
    console.log(displayBlock.info);
    incorrectWordChoices(wordInfo.word, " ", (newWord) => {
      if (newWord) {
        // add to corrections
        console.log("correcting to:" + chalk.green(newWord));
      }
      done();
    });
  }

  markdownSpellcheck.spellCallback(src, options, onSpellingMistake, () => onFinishedFile() );
}


program.parse(process.argv);

if (!program.args.length) {
  program.outputHelp();
  process.exit();
} else {

  const options = {
    ignoreAcronyms: program.ignoreAcronyms
  };

  const inputPatterns = program.args;
  const allFiles = [];
  async.each(inputPatterns, (inputPattern, inputPatternProcessed)=> {
    glob(inputPattern, (err, files) => {
      allFiles.push.apply(allFiles, files);
      inputPatternProcessed();
    });
  }, function() {
    async.eachSeries(allFiles, function(file, fileProcessed) {
        try {
          console.log("Spelling - " + chalk.bold(file));

          if (program.report) {
            var spellingInfo = markdownSpellcheck.spellFile(file, options);

            if (program.summary) {
              const summary = generateSummary(spellingInfo.errors);
              console.log(summary);
            } else {
              for (let k = 0; k < spellingInfo.errors.length; k++) {
                const error = spellingInfo.errors[k];

                var displayBlock = context.getBlock(spellingInfo.src, error.index, error.word.length);
                console.log(displayBlock.info);
              }
              console.log();
            }
            fileProcessed();
          } else {
            spellAndFixFile(file, options, fileProcessed);
          }
        }
        catch(e) {
          console.log("Error in " + files[j]);
          console.error(e);
          console.error(e.stack);
        }
      });
  });
}