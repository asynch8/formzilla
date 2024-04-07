"use strict";

const { StreamStorage } = require("./StreamStorage");
const busboy = require("busboy");
const { finished } = require("stream");

const tryParse = value => {
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
};
const formDataParser = async (instance, options) => {
	const { limits, storage = new StreamStorage() } = options;
	instance.addContentTypeParser("multipart/form-data", (request, message, done) => {
		const results = [];
		const body = {};
		const props = request.routeOptions.schema?.body?.properties;
		const parseField = props ? (name, value) => (props[name]?.type === "string" ? value : tryParse(value)) : (name, value) => value;
		const bus = busboy({ headers: message.headers, limits, defParamCharset: "utf8" });
		bus.on("file", (name, stream, info) => {
			results.push(storage.process(name, stream, info));
			if(!body[name]) {
				body[name] = JSON.stringify(info);
			} else if (body[name] && !Array.isArray(body[name])) {
				body[name] = [body[name], JSON.stringify(info)];
			} else {
				body[name].push(JSON.stringify(info));
			}
		});
		bus.on("field", (name, value) => {
			body[name] = parseField(name, value);
		});
		finished(bus, (err = null) => {
			Promise.all(results).then(files => {
				request.__files__ = files;
				done(err, body);
			});
		});
		message.pipe(bus);
	});
	instance.addHook("preHandler", async request => {
		const body = request.body;
		const files = request.__files__;
		if (files?.length) {
			let newBody = {};
			for (const file of files) {
				const field = file.field;
				delete file.field;
				if (!newBody[field]) {
					newBody[field] = file;
				} else if (newBody[field] && !Array.isArray(newBody[field])) {
					newBody[field] = [newBody[field], file];
				} else {
					newBody[field].push(file);
				}
			}
			Object.assign(body, newBody);
		}
		delete request.__files__;
	});
};
formDataParser[Symbol.for("skip-override")] = true;

exports.default = formDataParser;