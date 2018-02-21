/**
 * @license Copyright (c) 2003-2018, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

import VirtualTestEditor from '@ckeditor/ckeditor5-core/tests/_utils/virtualtesteditor';

import ImageCaptionEngine from '../../src/imagecaption/imagecaptionengine';
import ImageEngine from '../../src/image/imageengine';
import UndoEngine from '@ckeditor/ckeditor5-undo/src/undoengine';
import Paragraph from '@ckeditor/ckeditor5-paragraph/src/paragraph';

import ViewAttributeElement from '@ckeditor/ckeditor5-engine/src/view/attributeelement';
import ViewPosition from '@ckeditor/ckeditor5-engine/src/view/position';
import ModelElement from '@ckeditor/ckeditor5-engine/src/model/element';
import ModelRange from '@ckeditor/ckeditor5-engine/src/model/range';

import { getData as getModelData, setData as setModelData } from '@ckeditor/ckeditor5-engine/src/dev-utils/model';
import { getData as getViewData } from '@ckeditor/ckeditor5-engine/src/dev-utils/view';

describe( 'ImageCaptionEngine', () => {
	let editor, model, doc, view;

	beforeEach( () => {
		return VirtualTestEditor
			.create( {
				plugins: [ ImageCaptionEngine, ImageEngine, UndoEngine, Paragraph ]
			} )
			.then( newEditor => {
				editor = newEditor;
				model = editor.model;
				doc = model.document;
				view = editor.editing.view;
				model.schema.register( 'widget' );
				model.schema.extend( 'widget', { allowIn: '$root' } );
				model.schema.extend( 'caption', { allowIn: 'widget' } );
				model.schema.extend( '$text', { allowIn: 'widget' } );

				editor.conversion.elementToElement( {
					model: 'widget',
					view: 'widget'
				} );
			} );
	} );

	it( 'should be loaded', () => {
		expect( editor.plugins.get( ImageCaptionEngine ) ).to.be.instanceOf( ImageCaptionEngine );
	} );

	it( 'should set proper schema rules', () => {
		expect( model.schema.checkChild( [ '$root', 'image' ], 'caption' ) ).to.be.true;
		expect( model.schema.checkChild( [ '$root', 'image', 'caption' ], '$text' ) ).to.be.true;
		expect( model.schema.isLimit( 'caption' ) ).to.be.true;

		expect( model.schema.checkChild( [ '$root', 'image', 'caption' ], 'caption' ) ).to.be.false;

		model.schema.extend( '$block', { allowAttributes: 'aligmnent' } );
		expect( model.schema.checkAttribute( [ '$root', 'image', 'caption' ], 'alignment' ) ).to.be.false;
	} );

	describe( 'data pipeline', () => {
		describe( 'view to model', () => {
			it( 'should convert figcaption inside image figure', () => {
				editor.setData( '<figure class="image"><img src="foo.png" /><figcaption>foo bar</figcaption></figure>' );

				expect( getModelData( model, { withoutSelection: true } ) )
					.to.equal( '<image src="foo.png"><caption>foo bar</caption></image>' );
			} );

			it( 'should add empty caption if there is no figcaption', () => {
				editor.setData( '<figure class="image"><img src="foo.png" /></figure>' );

				expect( getModelData( model, { withoutSelection: true } ) )
					.to.equal( '<image src="foo.png"><caption></caption></image>' );
			} );

			it( 'should not convert figcaption inside other elements than image', () => {
				editor.setData( '<widget><figcaption>foobar</figcaption></widget>' );

				expect( getModelData( model, { withoutSelection: true } ) )
					.to.equal( '<widget>foobar</widget>' );
			} );
		} );

		describe( 'model to view', () => {
			it( 'should convert caption element to figcaption', () => {
				setModelData( model, '<image src="img.png"><caption>Foo bar baz.</caption></image>' );

				expect( editor.getData() ).to.equal(
					'<figure class="image"><img src="img.png"><figcaption>Foo bar baz.</figcaption></figure>'
				);
			} );

			it( 'should not convert caption to figcaption if it\'s empty', () => {
				setModelData( model, '<image src="img.png"><caption></caption></image>' );

				expect( editor.getData() ).to.equal( '<figure class="image"><img src="img.png"></figure>' );
			} );

			it( 'should not convert caption from other elements', () => {
				setModelData( model, '<widget>foo bar<caption></caption></widget>' );

				expect( editor.getData() ).to.equal( '<widget>foo bar</widget>' );
			} );
		} );
	} );

	describe( 'editing pipeline', () => {
		describe( 'model to view', () => {
			it( 'should convert caption element to figcaption contenteditable', () => {
				setModelData( model, '<image src="img.png"><caption>Foo bar baz.</caption></image>' );

				expect( getViewData( view, { withoutSelection: true } ) ).to.equal(
					'<figure class="ck-widget image" contenteditable="false">' +
						'<img src="img.png"></img>' +
						'<figcaption class="ck-editable" contenteditable="true" data-placeholder="Enter image caption">' +
							'Foo bar baz.' +
						'</figcaption>' +
					'</figure>'
				);
			} );

			it( 'should convert caption to element with proper CSS class if it\'s empty', () => {
				setModelData( model, '<paragraph>foo</paragraph><image src="img.png"><caption></caption></image>' );

				expect( getViewData( view, { withoutSelection: true } ) ).to.equal(
					'<p>foo</p>' +
					'<figure class="ck-widget image" contenteditable="false">' +
						'<img src="img.png"></img>' +
						'<figcaption class="ck-editable ck-hidden ck-placeholder" ' +
							'contenteditable="true" data-placeholder="Enter image caption">' +
						'</figcaption>' +
					'</figure>'
				);
			} );

			it( 'should not convert caption from other elements', () => {
				setModelData( model, '<widget>foo bar<caption></caption></widget>' );
				expect( getViewData( view, { withoutSelection: true } ) ).to.equal( '<widget>foo bar</widget>' );
			} );

			it( 'should not convert when element is already consumed', () => {
				editor.editing.downcastDispatcher.on(
					'insert:caption',
					( evt, data, conversionApi ) => {
						conversionApi.consumable.consume( data.item, 'insert' );

						const imageFigure = conversionApi.mapper.toViewElement( data.range.start.parent );
						const viewElement = new ViewAttributeElement( 'span' );

						const viewPosition = ViewPosition.createAt( imageFigure, 'end' );
						conversionApi.mapper.bindElements( data.item, viewElement );
						conversionApi.writer.insert( viewPosition, viewElement );
					},
					{ priority: 'high' }
				);

				setModelData( model, '<image src="img.png"><caption>Foo bar baz.</caption></image>' );

				expect( getViewData( view, { withoutSelection: true } ) ).to.equal(
					'<figure class="ck-widget image" contenteditable="false"><img src="img.png"></img><span></span>Foo bar baz.</figure>'
				);
			} );

			it( 'should show caption when something is inserted inside', () => {
				setModelData( model, '<paragraph>foo</paragraph><image src="img.png"><caption></caption></image>' );

				const image = doc.getRoot().getChild( 1 );
				const caption = image.getChild( 0 );

				model.change( writer => {
					writer.insertText( 'foo bar', caption );
				} );

				expect( getViewData( view ) ).to.equal(
					'<p>{}foo</p>' +
					'<figure class="ck-widget image" contenteditable="false">' +
						'<img src="img.png"></img>' +
						'<figcaption class="ck-editable" contenteditable="true" data-placeholder="Enter image caption">' +
							'foo bar' +
						'</figcaption>' +
					'</figure>'
				);
			} );

			it( 'should hide when everything is removed from caption', () => {
				setModelData( model, '<paragraph>foo</paragraph><image src="img.png"><caption>foo bar baz</caption></image>' );

				const image = doc.getRoot().getChild( 1 );
				const caption = image.getChild( 0 );

				model.change( writer => {
					writer.remove( ModelRange.createIn( caption ) );
				} );

				expect( getViewData( view ) ).to.equal(
					'<p>{}foo</p>' +
					'<figure class="ck-widget image" contenteditable="false">' +
						'<img src="img.png"></img>' +
						'<figcaption class="ck-editable ck-hidden ck-placeholder" ' +
							'contenteditable="true" data-placeholder="Enter image caption">' +
						'</figcaption>' +
					'</figure>'
				);
			} );

			it( 'should show when not everything is removed from caption', () => {
				setModelData( model, '<paragraph>foo</paragraph><image src="img.png"><caption>foo bar baz</caption></image>' );

				const image = doc.getRoot().getChild( 1 );
				const caption = image.getChild( 0 );

				model.change( writer => {
					writer.remove( ModelRange.createFromParentsAndOffsets( caption, 0, caption, 8 ) );
				} );

				expect( getViewData( view ) ).to.equal(
					'<p>{}foo</p>' +
					'<figure class="ck-widget image" contenteditable="false">' +
						'<img src="img.png"></img>' +
						'<figcaption class="ck-editable" contenteditable="true" data-placeholder="Enter image caption">baz</figcaption>' +
					'</figure>'
				);
			} );
		} );
	} );

	describe( 'inserting image to the document', () => {
		it( 'should add caption element if image does not have it', () => {
			model.change( writer => {
				writer.insertElement( 'image', { src: '', alt: '' }, doc.getRoot() );
			} );

			expect( getModelData( model ) ).to.equal(
				'[<image alt="" src=""><caption></caption></image>]<paragraph></paragraph>'
			);

			expect( getViewData( view ) ).to.equal(
				'[<figure class="ck-widget image" contenteditable="false">' +
					'<img alt="" src=""></img>' +
					'<figcaption class="ck-editable ck-placeholder" ' +
						'contenteditable="true" data-placeholder="Enter image caption">' +
					'</figcaption>' +
				'</figure>]' +
				'<p></p>'
			);
		} );

		it( 'should not add caption element if image already have it', () => {
			const caption = new ModelElement( 'caption', null, 'foo bar' );
			const image = new ModelElement( 'image', { src: '', alt: '' }, caption );

			model.change( writer => {
				writer.insert( image, doc.getRoot() );
			} );

			expect( getModelData( model ) ).to.equal(
				'[<image alt="" src=""><caption>foo bar</caption></image>]<paragraph></paragraph>'
			);

			expect( getViewData( view ) ).to.equal(
				'[<figure class="ck-widget image" contenteditable="false">' +
					'<img alt="" src=""></img>' +
					'<figcaption class="ck-editable" contenteditable="true" data-placeholder="Enter image caption">' +
						'foo bar' +
					'</figcaption>' +
				'</figure>]' +
				'<p></p>'
			);
		} );

		it( 'should not add caption element twice', () => {
			const image = new ModelElement( 'image', { src: '', alt: '' } );
			const caption = new ModelElement( 'caption' );

			model.change( writer => {
				// Since we are adding an empty image, this should trigger caption fixer.
				writer.insert( image, doc.getRoot() );

				// Add caption just after the image is inserted, in same batch.
				writer.insert( caption, image );
			} );

			// Check whether caption fixer added redundant caption.
			expect( getModelData( model ) ).to.equal(
				'[<image alt="" src=""><caption></caption></image>]<paragraph></paragraph>'
			);

			expect( getViewData( view ) ).to.equal(
				'[<figure class="ck-widget image" contenteditable="false">' +
					'<img alt="" src=""></img>' +
					'<figcaption class="ck-editable ck-placeholder" ' +
						'contenteditable="true" data-placeholder="Enter image caption"></figcaption>' +
				'</figure>]' +
				'<p></p>'
			);
		} );

		it( 'should do nothing for other changes than insert', () => {
			setModelData( model, '<image src=""><caption>foo bar</caption></image>' );

			const image = doc.getRoot().getChild( 0 );

			model.change( writer => {
				writer.setAttribute( 'alt', 'alt text', image );
			} );

			expect( getModelData( model, { withoutSelection: true } ) ).to.equal(
				'<image alt="alt text" src=""><caption>foo bar</caption></image>'
			);
		} );
	} );

	describe( 'editing view', () => {
		it( 'image should have empty figcaption element when is selected', () => {
			setModelData( model, '<paragraph>foo</paragraph>[<image src=""><caption></caption></image>]' );

			expect( getViewData( view ) ).to.equal(
				'<p>foo</p>' +
				'[<figure class="ck-widget image" contenteditable="false">' +
					'<img src=""></img>' +
					'<figcaption class="ck-editable ck-placeholder" contenteditable="true" data-placeholder="Enter image caption">' +
					'</figcaption>' +
				'</figure>]'
			);
		} );

		it( 'image should have empty figcaption element with hidden class when not selected', () => {
			setModelData( model, '<paragraph>[]foo</paragraph><image src=""><caption></caption></image>' );

			expect( getViewData( view ) ).to.equal(
				'<p>{}foo</p>' +
				'<figure class="ck-widget image" contenteditable="false">' +
					'<img src=""></img>' +
					'<figcaption class="ck-editable ck-hidden ck-placeholder" ' +
						'contenteditable="true" data-placeholder="Enter image caption">' +
					'</figcaption>' +
				'</figure>'
			);
		} );

		it( 'should not add additional figcaption if one is already present', () => {
			setModelData( model, '<paragraph>foo</paragraph>[<image src=""><caption>foo bar</caption></image>]' );

			expect( getViewData( view ) ).to.equal(
				'<p>foo</p>' +
				'[<figure class="ck-widget image" contenteditable="false">' +
					'<img src=""></img>' +
					'<figcaption class="ck-editable" contenteditable="true" data-placeholder="Enter image caption">foo bar</figcaption>' +
				'</figure>]'
			);
		} );

		it( 'should add hidden class to figcaption when caption is empty and image is no longer selected', () => {
			setModelData( model, '<paragraph>foo</paragraph>[<image src=""><caption></caption></image>]' );

			model.change( writer => {
				writer.setSelection( null );
			} );

			expect( getViewData( view ) ).to.equal(
				'<p>{}foo</p>' +
				'<figure class="ck-widget image" contenteditable="false">' +
					'<img src=""></img>' +
					'<figcaption class="ck-editable ck-hidden ck-placeholder" ' +
						'contenteditable="true" data-placeholder="Enter image caption">' +
					'</figcaption>' +
				'</figure>'
			);
		} );

		it( 'should not remove figcaption when selection is inside it even when it is empty', () => {
			setModelData( model, '<image src=""><caption>[foo bar]</caption></image>' );

			model.change( writer => {
				writer.remove( doc.selection.getFirstRange() );
			} );

			expect( getViewData( view ) ).to.equal(
				'<figure class="ck-widget image" contenteditable="false">' +
					'<img src=""></img>' +
					'<figcaption class="ck-editable ck-placeholder" contenteditable="true" data-placeholder="Enter image caption">' +
						'[]' +
					'</figcaption>' +
				'</figure>'
			);
		} );

		it( 'should not remove figcaption when selection is moved from it to its image', () => {
			setModelData( model, '<image src=""><caption>[foo bar]</caption></image>' );
			const image = doc.getRoot().getChild( 0 );

			model.change( writer => {
				writer.remove( doc.selection.getFirstRange() );
				writer.setSelection( ModelRange.createOn( image ) );
			} );

			expect( getViewData( view ) ).to.equal(
				'[<figure class="ck-widget image" contenteditable="false">' +
					'<img src=""></img>' +
					'<figcaption class="ck-editable ck-placeholder" ' +
						'contenteditable="true" data-placeholder="Enter image caption"></figcaption>' +
				'</figure>]'
			);
		} );

		it( 'should not remove figcaption when selection is moved from it to other image', () => {
			setModelData( model, '<image src=""><caption>[foo bar]</caption></image><image src=""><caption></caption></image>' );
			const image = doc.getRoot().getChild( 1 );

			model.change( writer => {
				writer.setSelection( ModelRange.createOn( image ) );
			} );

			expect( getViewData( view ) ).to.equal(
				'<figure class="ck-widget image" contenteditable="false">' +
					'<img src=""></img>' +
					'<figcaption class="ck-editable" contenteditable="true" data-placeholder="Enter image caption">foo bar</figcaption>' +
				'</figure>' +
				'[<figure class="ck-widget image" contenteditable="false">' +
					'<img src=""></img>' +
					'<figcaption class="ck-editable ck-placeholder" ' +
						'contenteditable="true" data-placeholder="Enter image caption"></figcaption>' +
				'</figure>]'
			);
		} );

		describe( 'undo/redo integration', () => {
			it( 'should create view element after redo', () => {
				setModelData( model, '<paragraph>foo</paragraph><image src=""><caption>[foo bar baz]</caption></image>' );

				const modelRoot = doc.getRoot();
				const modelImage = modelRoot.getChild( 1 );
				const modelCaption = modelImage.getChild( 0 );

				// Remove text and selection from caption.
				model.change( writer => {
					writer.remove( ModelRange.createIn( modelCaption ) );
					writer.setSelection( null );
				} );

				// Check if there is no figcaption in the view.
				expect( getViewData( view ) ).to.equal(
					'<p>{}foo</p>' +
					'<figure class="ck-widget image" contenteditable="false">' +
						'<img src=""></img>' +
						'<figcaption class="ck-editable ck-hidden ck-placeholder" ' +
							'contenteditable="true" data-placeholder="Enter image caption">' +
						'</figcaption>' +
					'</figure>'
				);

				editor.execute( 'undo' );

				// Check if figcaption is back with contents.
				expect( getViewData( view ) ).to.equal(
					'<p>foo</p>' +
					'<figure class="ck-widget image" contenteditable="false">' +
						'<img src=""></img>' +
						'<figcaption class="ck-editable" contenteditable="true" data-placeholder="Enter image caption">' +
							'{foo bar baz}' +
						'</figcaption>' +
					'</figure>'
				);
			} );

			it( 'undo should work after inserting the image', () => {
				const image = new ModelElement( 'image' );
				image.setAttribute( 'src', '/foo.png' );

				setModelData( model, '<paragraph>foo[]</paragraph>' );

				model.change( writer => {
					writer.insert( image, doc.getRoot() );
				} );

				expect( getModelData( model ) ).to.equal( '<image src="/foo.png"><caption></caption></image><paragraph>foo[]</paragraph>' );

				editor.execute( 'undo' );

				expect( getModelData( model ) ).to.equal( '<paragraph>foo[]</paragraph>' );
			} );
		} );
	} );
} );
